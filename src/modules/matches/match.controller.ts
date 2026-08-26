import type { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { idParamsSchema } from "../../utils/validation";
import { RegistrationModel } from "../registrations/registration.model";
import { TournamentModel } from "../tournaments/tournament.model";
import { MatchModel } from "./match.model";
import {
  assignMatchSchema,
  completeMatchSchema,
  createMatchSchema,
  matchQuerySchema,
  updateMatchSchema
} from "./match.validation";
import {
  assignMatchToCourt,
  buildAvailabilityMap,
  completeMatch,
  startMatch
} from "./matchQueue.service";

interface MatchReferenceTeam {
  players: Array<{ registrationId: unknown }>;
}

const validateMatchReferences = async (
  tournamentId: string,
  courtId: string,
  finalGroupId: string | null | undefined,
  teams: MatchReferenceTeam[]
): Promise<void> => {
  const tournament = await TournamentModel.findById(tournamentId);
  if (!tournament) {
    throw new ApiError(400, "Referenced tournament not found");
  }

  const hasCourt = tournament.courts.some(
    (court) => String((court as typeof court & { _id: unknown })._id) === courtId
  );
  if (!hasCourt) {
    throw new ApiError(400, "courtId does not belong to the tournament");
  }

  if (
    finalGroupId &&
    !tournament.finalGroups.some(
      (group) => String((group as typeof group & { _id: unknown })._id) === finalGroupId
    )
  ) {
    throw new ApiError(400, "finalGroupId does not belong to the tournament");
  }

  const registrationIds = teams.flatMap((team) =>
    team.players.map((player) => String(player.registrationId))
  );
  const registrationCount = await RegistrationModel.countDocuments({
    _id: { $in: registrationIds },
    tournamentId
  });
  if (registrationCount !== registrationIds.length) {
    throw new ApiError(400, "All registrations must exist and belong to the tournament");
  }
};

// Qualification matches are the generator's output. A hand-made one would not be
// removed by a cancellation and would then block every regeneration attempt.
const assertNotQualificationPhase = (phase: string | undefined): void => {
  if (phase === "qualification") {
    throw new ApiError(
      409,
      "Qualification matches are produced by the tournament generator and cannot be managed directly"
    );
  }
};

export const createMatch = async (req: Request, res: Response): Promise<void> => {
  const body = createMatchSchema.parse(req.body);
  assertNotQualificationPhase(body.phase);
  await validateMatchReferences(
    body.tournamentId,
    body.courtId,
    body.finalGroupId,
    body.teams
  );

  const match = await MatchModel.create({
    ...body,
    scheduledAt: new Date(body.scheduledAt),
    status: body.status ?? "scheduled"
  });
  res.status(201).json({ message: "Match created", match });
};

export const listMatches = async (req: Request, res: Response): Promise<void> => {
  const query = matchQuerySchema.parse(req.query);
  const matches = await MatchModel.find(query)
    .populate("refereeUserId", "email name")
    .sort({ scheduledAt: 1, queuePosition: 1 });
  const availability = await buildAvailabilityMap(matches);
  res.status(200).json({
    matches: matches.map((match) => ({
      ...match.toJSON(),
      availability: availability.get(String(match._id))
    }))
  });
};

export const getMatch = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const match = await MatchModel.findById(id).populate("refereeUserId", "email name");

  if (!match) {
    throw new ApiError(404, "Match not found");
  }

  const availability = await buildAvailabilityMap([match]);
  res.status(200).json({
    match: { ...match.toJSON(), availability: availability.get(String(match._id)) }
  });
};

export const updateMatch = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const body = updateMatchSchema.parse(req.body);
  const match = await MatchModel.findById(id);

  if (!match) {
    throw new ApiError(404, "Match not found");
  }
  if (match.generationSeed) {
    throw new ApiError(409, "Generated match composition is immutable");
  }
  assertNotQualificationPhase(body.phase);

  const tournamentId = body.tournamentId ?? String(match.tournamentId);
  const courtId = body.courtId ?? String(match.courtId);
  const finalGroupId = body.finalGroupId === undefined
    ? match.finalGroupId && String(match.finalGroupId)
    : body.finalGroupId;
  const teams = body.teams ?? match.teams;
  await validateMatchReferences(tournamentId, courtId, finalGroupId, teams);

  match.set({
    ...body,
    ...(body.scheduledAt && { scheduledAt: new Date(body.scheduledAt) })
  });
  await match.save();
  res.status(200).json({ message: "Match updated", match });
};

export const deleteMatch = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const existingMatch = await MatchModel.findById(id);

  if (!existingMatch) {
    throw new ApiError(404, "Match not found");
  }
  if (existingMatch.generationSeed) {
    throw new ApiError(409, "Generated matches cannot be deleted individually");
  }
  await existingMatch.deleteOne();

  res.status(200).json({ message: "Match deleted" });
};

export const assignQueuedMatch = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const { courtId } = assignMatchSchema.parse(req.body);
  const match = await assignMatchToCourt(id, courtId);
  res.status(200).json({ message: "Match assigned", match });
};

export const startQueuedMatch = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const match = await startMatch(id);
  res.status(200).json({ message: "Match started", match });
};

export const completeQueuedMatch = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const { scoreA, scoreB } = completeMatchSchema.parse(req.body);
  const result = await completeMatch(id, scoreA, scoreB);
  res.status(200).json({ message: "Match completed", ...result });
};