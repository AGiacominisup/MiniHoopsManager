import type { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { idParamsSchema, tournamentCourtParamsSchema } from "../../utils/validation";
import { MatchModel } from "../matches/match.model";
import { RegistrationModel } from "../registrations/registration.model";
import { PlayerModel } from "../players/player.model";
import { assignNextMatch } from "../matches/matchQueue.service";
import { loadTournament, loadUnlockedTournament } from "./tournament.guards";
import { TournamentModel } from "./tournament.model";
import {
  bulkAttendanceSchema,
  bulkTournamentRegistrationsSchema,
  createTournamentSchema,
  qualificationGenerateSchema,
  qualificationPreviewSchema,
  tournamentStartSchema,
  updateTournamentSchema
} from "./tournament.validation";
import {
  cancelQualification,
  evaluateQualificationReadiness,
  generateQualification,
  previewQualification,
  startTournament
} from "./qualification.service";

export const createTournament = async (req: Request, res: Response): Promise<void> => {
  const body = createTournamentSchema.parse(req.body);

  const tournament = await TournamentModel.create({
    name: body.name,
    ...(body.startDate && { startDate: new Date(body.startDate) }),
    ...(body.endDate && { endDate: new Date(body.endDate) }),
    category: body.category,
    winPoints: body.winPoints,
    courts: body.courts ?? [],
    finalGroups: body.finalGroups ?? [],
    ...(body.configuration && { configuration: body.configuration })
  });

  res.status(201).json({ message: "Tournament created", tournament });
};

export const listTournaments = async (_req: Request, res: Response): Promise<void> => {
  const tournaments = await TournamentModel.find().sort({ startDate: 1, createdAt: 1 });
  res.status(200).json({ tournaments });
};

export const getTournament = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const tournament = await loadTournament(id);

  res.status(200).json({ tournament });
};

export const updateTournament = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const body = updateTournamentSchema.parse(req.body);
  const tournament = await loadTournament(id);

  if (tournament.status !== "draft" && (body.configuration || body.courts)) {
    throw new ApiError(409, "Tournament configuration and courts are locked once it has started");
  }

  const startDate = body.startDate ? new Date(body.startDate) : tournament.startDate;
  const endDate = body.endDate ? new Date(body.endDate) : tournament.endDate;
  if (startDate && endDate && endDate < startDate) {
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
  const tournament = await loadTournament(id);

  const [registered, checkedIn, withdrawn] = await Promise.all([
    RegistrationModel.countDocuments({ tournamentId: id, attendanceStatus: "registered" }),
    RegistrationModel.countDocuments({ tournamentId: id, attendanceStatus: "checked_in" }),
    RegistrationModel.countDocuments({ tournamentId: id, attendanceStatus: "withdrawn" })
  ]);
  const blockers = evaluateQualificationReadiness(tournament, checkedIn);

  res.status(200).json({
    tournament,
    attendance: { registered, checkedIn, withdrawn },
    readiness: { ready: blockers.length === 0, blockers }
  });
};

export const listAvailablePlayers = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  await loadTournament(id);

  const registrations = await RegistrationModel.find({ tournamentId: id }).select({ playerId: 1 });
  const players = await PlayerModel.find({
    _id: { $nin: registrations.map((registration) => registration.playerId) }
  }).sort({ lastName: 1, firstName: 1 });

  res.status(200).json({ players });
};

export const bulkRegisterPlayers = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const body = bulkTournamentRegistrationsSchema.parse(req.body);
  const playerIds = [...new Set(body.playerIds)];

  await loadUnlockedTournament(id);

  const players = await PlayerModel.find({ _id: { $in: playerIds } }).select({
    firstName: 1,
    lastName: 1,
    jerseyNumber: 1
  });
  if (players.length !== playerIds.length) {
    throw new ApiError(400, "One or more players do not exist");
  }

  const existing = await RegistrationModel.find({ tournamentId: id, playerId: { $in: playerIds } });
  const existingPlayerIds = new Set(existing.map((registration) => String(registration.playerId)));
  const created = await RegistrationModel.create(
    players
      .filter((player) => !existingPlayerIds.has(String(player._id)))
      .map((player) => {
        // A registration is only valid with a jersey number or a named player, so
        // a nameless player's number is carried over instead of failing to save.
        const hasName = Boolean(player.firstName || player.lastName);
        if (!hasName && player.jerseyNumber === undefined) {
          throw new ApiError(
            400,
            `Player ${String(player._id)} needs a name or a jersey number before registration`
          );
        }
        return {
          tournamentId: id,
          playerId: player._id,
          ...(!hasName && { jerseyNumber: player.jerseyNumber })
        };
      })
  );

  res.status(201).json({
    registrations: [...existing, ...created],
    summary: { created: created.length, alreadyRegistered: existing.length }
  });
};

export const bulkUnregisterPlayers = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const body = bulkTournamentRegistrationsSchema.parse(req.body);
  const playerIds = [...new Set(body.playerIds)];

  await loadUnlockedTournament(id);

  const registrations = await RegistrationModel.find({
    tournamentId: id,
    playerId: { $in: playerIds }
  }).select({ _id: 1 });
  const registrationIds = registrations.map((registration) => registration._id);

  const referencedByMatch = await MatchModel.exists({
    "teams.players.registrationId": { $in: registrationIds }
  });
  if (referencedByMatch) {
    throw new ApiError(409, "Registrations cannot be removed while matches reference them");
  }

  const { deletedCount } = await RegistrationModel.deleteMany({ _id: { $in: registrationIds } });

  res.status(200).json({ message: "Registrations removed", summary: { deleted: deletedCount } });
};

export const bulkUpdateAttendance = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const { attendanceStatus, registrationIds } = bulkAttendanceSchema.parse(req.body);

  await loadUnlockedTournament(id);

  const { modifiedCount } = await RegistrationModel.updateMany(
    {
      tournamentId: id,
      ...(registrationIds && { _id: { $in: registrationIds } })
    },
    {
      $set: {
        attendanceStatus,
        checkedInAt: attendanceStatus === "checked_in" ? new Date() : null
      }
    }
  );

  res.status(200).json({ message: "Attendance updated", summary: { modified: modifiedCount } });
};

export const startTournamentQualification = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const { seed } = tournamentStartSchema.parse(req.body ?? {});
  const result = await startTournament(id, seed);
  res.status(result.idempotent ? 200 : 201).json({ message: "Tournament started", ...result });
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
