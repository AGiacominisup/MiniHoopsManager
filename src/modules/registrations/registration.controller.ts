import type { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { idParamsSchema } from "../../utils/validation";
import { MatchModel } from "../matches/match.model";
import { PlayerModel } from "../players/player.model";
import { TournamentModel } from "../tournaments/tournament.model";
import { RegistrationModel } from "./registration.model";
import {
  attendanceSchema,
  createRegistrationSchema,
  registrationQuerySchema,
  updateRegistrationSchema
} from "./registration.validation";

const validateRegistrationReferences = async (
  tournamentId: string,
  playerId: string,
  finalGroupId?: string | null
): Promise<void> => {
  const [tournament, player] = await Promise.all([
    TournamentModel.findById(tournamentId),
    PlayerModel.exists({ _id: playerId })
  ]);

  if (!tournament) {
    throw new ApiError(400, "Referenced tournament not found");
  }
  if (tournament.qualification.status !== "draft") {
    throw new ApiError(409, "Roster is locked after qualification generation");
  }
  if (!player) {
    throw new ApiError(400, "Referenced player not found");
  }
  if (
    finalGroupId &&
    !tournament.finalGroups.some(
      (group) => String((group as typeof group & { _id: unknown })._id) === finalGroupId
    )
  ) {
    throw new ApiError(400, "finalGroupId does not belong to the tournament");
  }
};

export const createRegistration = async (req: Request, res: Response): Promise<void> => {
  const body = createRegistrationSchema.parse(req.body);
  await validateRegistrationReferences(body.tournamentId, body.playerId, body.finalGroupId);

  const existing = await RegistrationModel.exists({
    tournamentId: body.tournamentId,
    playerId: body.playerId
  });
  if (existing) {
    throw new ApiError(409, "Player is already registered for this tournament");
  }

  const registration = await RegistrationModel.create(body);
  res.status(201).json({ message: "Registration created", registration });
};

export const listRegistrations = async (req: Request, res: Response): Promise<void> => {
  const query = registrationQuerySchema.parse(req.query);
  const registrations = await RegistrationModel.find(query).sort({ createdAt: 1 });
  res.status(200).json({ registrations });
};

export const getRegistration = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const registration = await RegistrationModel.findById(id);

  if (!registration) {
    throw new ApiError(404, "Registration not found");
  }

  res.status(200).json({ registration });
};

export const updateRegistration = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const body = updateRegistrationSchema.parse(req.body);
  const registration = await RegistrationModel.findById(id);

  if (!registration) {
    throw new ApiError(404, "Registration not found");
  }

  const tournamentId = body.tournamentId ?? String(registration.tournamentId);
  const playerId = body.playerId ?? String(registration.playerId);
  const finalGroupId = body.finalGroupId === undefined
    ? registration.finalGroupId && String(registration.finalGroupId)
    : body.finalGroupId;
  await validateRegistrationReferences(tournamentId, playerId, finalGroupId);

  if (body.tournamentId || body.playerId) {
    const existing = await RegistrationModel.exists({
      _id: { $ne: id },
      tournamentId,
      playerId
    });
    if (existing) {
      throw new ApiError(409, "Player is already registered for this tournament");
    }
  }

  registration.set(body);
  await registration.save();
  res.status(200).json({ message: "Registration updated", registration });
};

export const deleteRegistration = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const existingRegistration = await RegistrationModel.findById(id);
  if (!existingRegistration) {
    throw new ApiError(404, "Registration not found");
  }
  const tournament = await TournamentModel.findById(existingRegistration.tournamentId);
  if (tournament?.qualification.status !== "draft") {
    throw new ApiError(409, "Roster is locked after qualification generation");
  }
  const hasMatches = await MatchModel.exists({ "teams.players.registrationId": id });
  if (hasMatches) {
    throw new ApiError(409, "Registration cannot be deleted while matches reference it");
  }

  await existingRegistration.deleteOne();

  res.status(200).json({ message: "Registration deleted" });
};

export const updateAttendance = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const { attendanceStatus } = attendanceSchema.parse(req.body);
  const registration = await RegistrationModel.findById(id);
  if (!registration) {
    throw new ApiError(404, "Registration not found");
  }

  const tournament = await TournamentModel.findById(registration.tournamentId);
  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }
  if (tournament.qualification.status !== "draft") {
    throw new ApiError(409, "Roster is locked after qualification generation");
  }

  registration.attendanceStatus = attendanceStatus;
  registration.checkedInAt = attendanceStatus === "checked_in" ? new Date() : null;
  await registration.save();
  res.status(200).json({ message: "Attendance updated", registration });
};