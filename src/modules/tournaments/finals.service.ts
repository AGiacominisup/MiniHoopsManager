import mongoose, { type ClientSession } from "mongoose";
import { ApiError } from "../../utils/ApiError";
import { MatchModel, type MatchDocument } from "../matches/match.model";
import { MatchReportModel } from "../matchReports/matchReport.model";
import { PlayerModel } from "../players/player.model";
import {
  hasPlayerDisplayIdentity,
  playerDisplayName,
  resolveJerseyNumber
} from "../players/playerIdentity";
import { RegistrationModel } from "../registrations/registration.model";
import { recomputeRegistrationAggregates } from "../registrations/registrationAggregates.service";
import {
  buildFinalsPlan,
  evaluateFinalsReadiness,
  type FinalGroupRef,
  type FinalsPlan,
  type FinalsReadiness,
  type RankedFinalsPlayer
} from "./finalsScheduler";
import { loadTournament, type TournamentEntity } from "./tournament.guards";
import { TournamentModel } from "./tournament.model";

interface FinalsContext {
  tournament: TournamentEntity;
  players: RankedFinalsPlayer[];
  groups: FinalGroupRef[];
  readiness: FinalsReadiness;
}

const toGroupRefs = (tournament: TournamentEntity): FinalGroupRef[] =>
  tournament.finalGroups.map((group) => ({
    id: String((group as typeof group & { _id: unknown })._id),
    themeName: group.themeName,
    level: group.level
  }));

const toMatchPlayer = (player: RankedFinalsPlayer) => ({
  registrationId: player.registrationId,
  ...(player.jerseyNumber !== undefined && { jerseyNumber: player.jerseyNumber }),
  ...(player.name && { name: player.name }),
  ...(player.skillRating !== undefined && { skillRating: player.skillRating })
});

const loadQualificationProgress = async (
  tournamentId: string,
  session?: ClientSession
) => {
  const matchQuery = MatchModel.find({ tournamentId, phase: "qualification" }).select({
    _id: 1,
    status: 1
  });
  const matches = await (session ? matchQuery.session(session) : matchQuery);
  const matchIds = matches.map((match) => match._id);
  const reportQuery = MatchReportModel.find({ matchId: { $in: matchIds } }).select({ matchId: 1 });
  const reports = await (session ? reportQuery.session(session) : reportQuery);
  const reportedIds = new Set(reports.map((report) => String(report.matchId)));

  return {
    qualificationMatchCount: matches.length,
    completedQualificationCount: matches.filter((match) => match.status === "completed").length,
    reportedQualificationCount: matches.filter((match) => reportedIds.has(String(match._id))).length
  };
};

export const loadFinalsReadiness = async (
  tournament: TournamentEntity,
  session?: ClientSession
): Promise<FinalsReadiness> => {
  const tournamentId = String(tournament._id);
  const registrationQuery = RegistrationModel.countDocuments({
    tournamentId,
    attendanceStatus: "checked_in"
  });
  const checkedInCount = await (session ? registrationQuery.session(session) : registrationQuery);
  const progress = await loadQualificationProgress(tournamentId, session);

  return evaluateFinalsReadiness({
    status: tournament.status,
    checkedInCount,
    playersPerMatch: tournament.configuration.playersPerMatch,
    hasEnabledCourt: tournament.courts.some((court) => court.enabled),
    finalGroups: toGroupRefs(tournament),
    ...progress
  });
};

const loadFinalsContext = async (
  tournamentId: string,
  session: ClientSession
): Promise<FinalsContext> => {
  const tournament = await loadTournament(tournamentId, session);
  const readiness = await loadFinalsReadiness(tournament, session);
  if (!readiness.ready) {
    throw new ApiError(409, readiness.blockers.join("; "));
  }

  const registrationQuery = RegistrationModel.find({
    tournamentId,
    attendanceStatus: "checked_in"
  });
  const registrations = await registrationQuery.session(session);
  const playerIds = registrations.map((registration) => registration.playerId);
  const playersById = new Map(
    (await PlayerModel.find({ _id: { $in: playerIds } }).session(session)).map((player) => [
      String(player._id),
      player
    ])
  );

  const players = registrations.map((registration): RankedFinalsPlayer => {
    const player = playersById.get(String(registration.playerId));
    const name = playerDisplayName(player);
    const jerseyNumber = resolveJerseyNumber(registration.jerseyNumber, player?.jerseyNumber);
    if (!hasPlayerDisplayIdentity(name, jerseyNumber)) {
      throw new ApiError(409, `Registration ${String(registration._id)} has no display identity`);
    }
    const skillRating = registration.skillRating ?? player?.skillRating;
    return {
      registrationId: String(registration._id),
      ...(jerseyNumber !== undefined && { jerseyNumber }),
      ...(name && { name }),
      ...(skillRating !== undefined && { skillRating }),
      rankingPoints: registration.rankingPoints,
      wins: registration.wins,
      pointsMade: registration.pointsMade,
      pointsScored: registration.pointsScored,
      pointsAllowed: registration.pointsAllowed
    };
  });

  return {
    tournament,
    players,
    groups: toGroupRefs(tournament),
    readiness
  };
};

const persistFinalsPlan = async (
  tournamentId: string,
  plan: FinalsPlan,
  session: ClientSession
): Promise<{
  tournament: TournamentEntity;
  matches: mongoose.HydratedDocument<MatchDocument>[];
}> => {
  const existingMatches = await MatchModel.exists({
    tournamentId,
    phase: "final"
  }).session(session);
  if (existingMatches) {
    throw new ApiError(409, "Final matches already exist for this tournament");
  }

  const tournament = await TournamentModel.findOneAndUpdate(
    { _id: tournamentId, status: "qualification" },
    {
      $set: {
        status: "finals",
        "finals.generatedAt": new Date(),
        "finals.totalMatches": plan.matches.length
      }
    },
    { new: true, runValidators: true, session }
  );
  if (!tournament) {
    throw new ApiError(409, "The tournament is no longer in qualification");
  }

  const matches = await MatchModel.insertMany(
    plan.matches.map((match) => ({
      tournamentId,
      courtId: null,
      finalGroupId: match.finalGroupId,
      phase: "final",
      status: "queued",
      scoreA: 0,
      scoreB: 0,
      teams: match.teams.map((team) => ({
        side: team.side,
        players: team.players.map(toMatchPlayer)
      })),
      queuePosition: match.queuePosition,
      generationSeed: "finals"
    })),
    { session, ordered: true }
  );

  for (const assignment of plan.assignments) {
    await RegistrationModel.updateOne(
      { _id: assignment.registrationId },
      {
        $set: {
          qualificationRank: assignment.qualificationRank,
          finalGroupId: assignment.finalGroupId
        }
      },
      { session }
    );
  }

  return { tournament, matches };
};

const loadExistingFinals = async (tournamentId: string, tournament: TournamentEntity) => {
  const matches = await MatchModel.find({ tournamentId, phase: "final" }).sort({
    queuePosition: 1
  });
  if (matches.length !== (tournament.finals?.totalMatches ?? 0)) {
    throw new ApiError(409, "Stored final matches do not match the generated plan");
  }
  return { tournament, matches, idempotent: true as const };
};

export const generateFinals = async (tournamentId: string) => {
  const tournament = await loadTournament(tournamentId);

  if (
    tournament.status === "finals" ||
    (tournament.status === "completed" && (tournament.finals?.totalMatches ?? 0) > 0)
  ) {
    return loadExistingFinals(tournamentId, tournament);
  }

  const session = await mongoose.startSession();
  try {
    let result:
      | {
          tournament: TournamentEntity;
          matches: mongoose.HydratedDocument<MatchDocument>[];
          idempotent: boolean;
        }
      | undefined;

    await session.withTransaction(async () => {
      const freshTournament = await loadTournament(tournamentId, session);
      if (
        freshTournament.status === "finals" ||
        (freshTournament.status === "completed" && (freshTournament.finals?.totalMatches ?? 0) > 0)
      ) {
        const matches = await MatchModel.find({ tournamentId, phase: "final" })
          .sort({ queuePosition: 1 })
          .session(session);
        result = { tournament: freshTournament, matches, idempotent: true };
        return;
      }

      const checkedInIds = (
        await RegistrationModel.find({ tournamentId, attendanceStatus: "checked_in" })
          .select({ _id: 1 })
          .session(session)
      ).map((registration) => String(registration._id));
      await recomputeRegistrationAggregates(checkedInIds, tournamentId, session);

      const context = await loadFinalsContext(tournamentId, session);
      let plan: ReturnType<typeof buildFinalsPlan>;
      try {
        plan = buildFinalsPlan(context.players, context.groups);
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }
        throw new ApiError(
          409,
          error instanceof Error ? error.message : "Finals plan could not be generated"
        );
      }
      const persisted = await persistFinalsPlan(tournamentId, plan, session);
      result = { ...persisted, idempotent: false };
    });

    if (!result) {
      throw new ApiError(500, "Finals generation did not run");
    }
    return result;
  } finally {
    await session.endSession();
  }
};
