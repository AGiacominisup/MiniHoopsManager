import type { Request, Response } from "express";
import { Types } from "mongoose";
import { ApiError } from "../../utils/ApiError";
import { idParamsSchema, tournamentCourtParamsSchema } from "../../utils/validation";
import { MatchModel } from "../matches/match.model";
import { RegistrationModel } from "../registrations/registration.model";
import { PlayerModel } from "../players/player.model";
import { assignNextMatch } from "../matches/matchQueue.service";
import { TournamentModel } from "./tournament.model";
import {
  bulkTournamentRegistrationsSchema,
  createTournamentSchema,
  qualificationGenerateSchema,
  qualificationPreviewSchema,
  updateTournamentSchema
} from "./tournament.validation";
import {
  cancelQualification,
  generateQualification,
  previewQualification
} from "./qualification.service";

export const createTournament = async (req: Request, res: Response): Promise<void> => {
  const body = createTournamentSchema.parse(req.body);

  const tournament = await TournamentModel.create({
    name: body.name,
    startDate: new Date(body.startDate),
    endDate: new Date(body.endDate),
    category: body.category,
    winPoints: body.winPoints,
    status: body.status,
    courts: body.courts ?? [],
    finalGroups: body.finalGroups ?? [],
    ...(body.configuration && { configuration: body.configuration })
  });

  res.status(201).json({ message: "Tournament created", tournament });
};

export const listTournaments = async (_req: Request, res: Response): Promise<void> => {
  const tournaments = await TournamentModel.find().sort({ startDate: 1 });
  res.status(200).json({ tournaments });
};

export const getTournament = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const tournament = await TournamentModel.findById(id);

  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }

  res.status(200).json({ tournament });
};

export const updateTournament = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const body = updateTournamentSchema.parse(req.body);
  const tournament = await TournamentModel.findById(id);

  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }

  if (tournament.qualification.status !== "draft" && (body.configuration || body.courts)) {
    throw new ApiError(409, "Tournament configuration and courts are locked after generation");
  }

  const startDate = body.startDate ? new Date(body.startDate) : tournament.startDate;
  const endDate = body.endDate ? new Date(body.endDate) : tournament.endDate;
  if (endDate < startDate) {
    throw new ApiError(400, "endDate must be after startDate");
  }

  tournament.set({
    ...body,
    ...(body.startDate && { startDate }),
    ...(body.endDate && { endDate })
  });
  await tournament.save();

  res.status(200).json({ message: "Tournament updated", tournament });
};

export const deleteTournament = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const hasRelatedResources = await Promise.all([
    RegistrationModel.exists({ tournamentId: id }),
    MatchModel.exists({ tournamentId: id })
  ]);
  if (hasRelatedResources.some(Boolean)) {
    throw new ApiError(409, "Tournament cannot be deleted while registrations or matches exist");
  }

  const tournament = await TournamentModel.findByIdAndDelete(id);

  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }

  res.status(200).json({ message: "Tournament deleted" });
};

export const getTournamentSetup = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const tournament = await TournamentModel.findById(id);
  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }

  const [registered, checkedIn, withdrawn] = await Promise.all([
    RegistrationModel.countDocuments({ tournamentId: id, attendanceStatus: "registered" }),
    RegistrationModel.countDocuments({ tournamentId: id, attendanceStatus: "checked_in" }),
    RegistrationModel.countDocuments({ tournamentId: id, attendanceStatus: "withdrawn" })
  ]);
  const blockers: string[] = [];
  if (checkedIn < tournament.configuration.playersPerMatch) {
    blockers.push("At least 6 players must be checked in");
  }
  if (!tournament.courts.some((court) => court.enabled)) {
    blockers.push("At least one court must be enabled");
  }
  if (tournament.qualification.status !== "draft") {
    blockers.push("Qualification matches have already been generated");
  }

  res.status(200).json({
    tournament,
    attendance: { registered, checkedIn, withdrawn },
    readiness: { ready: blockers.length === 0, blockers }
  });
};

export const bulkRegisterPlayers = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const body = bulkTournamentRegistrationsSchema.parse(req.body);
  const playerIds = [...new Set(body.playerIds)];
  if (playerIds.some((playerId) => !Types.ObjectId.isValid(playerId))) {
    throw new ApiError(400, "Every playerId must be a valid MongoDB ObjectId");
  }

  const tournament = await TournamentModel.findById(id);
  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }
  if (tournament.qualification.status !== "draft") {
    throw new ApiError(409, "Roster is locked after qualification generation");
  }

  const existingPlayers = await PlayerModel.find({ _id: { $in: playerIds } }).select({ _id: 1 });
  if (existingPlayers.length !== playerIds.length) {
    throw new ApiError(400, "One or more players do not exist");
  }
  const existing = await RegistrationModel.find({ tournamentId: id, playerId: { $in: playerIds } });
  const existingPlayerIds = new Set(existing.map((registration) => String(registration.playerId)));
  const created = await RegistrationModel.create(
    playerIds
      .filter((playerId) => !existingPlayerIds.has(playerId))
      .map((playerId) => ({ tournamentId: id, playerId }))
  );
  res.status(201).json({ registrations: [...existing, ...created] });
};

export const previewTournamentQualification = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const { seed } = qualificationPreviewSchema.parse(req.body);
  res.status(200).json(await previewQualification(id, seed));
};

export const generateTournamentQualification = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const body = qualificationGenerateSchema.parse(req.body);
  const result = await generateQualification(id, body.seed, body.rosterFingerprint);
  res.status(result.idempotent ? 200 : 201).json(result);
};

export const cancelTournamentQualification = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  await cancelQualification(id);
  res.status(200).json({ message: "Qualification generation cancelled" });
};

export const assignNextTournamentMatch = async (req: Request, res: Response): Promise<void> => {
  const { id, courtId } = tournamentCourtParamsSchema.parse(req.params);
  const match = await assignNextMatch(id, courtId);
  res.status(200).json({ match });
};
