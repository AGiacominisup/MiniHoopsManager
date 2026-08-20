import type { ClientSession } from "mongoose";
import { ApiError } from "../../utils/ApiError";
import type { MatchDocument, MatchSide } from "../matches/match.model";
import { MatchModel } from "../matches/match.model";
import { resolveMatchOutcome } from "../matches/matchQueue.service";
import { MatchReportModel, type MatchReportDocument } from "../matchReports/matchReport.model";
import { loadTournament } from "../tournaments/tournament.guards";
import { RegistrationModel } from "./registration.model";

export interface RegistrationAggregates {
  matchesPlayed: number;
  wins: number;
  rankingPoints: number;
  pointsScored: number;
  pointsAllowed: number;
  pointsMade: number;
  assists: number;
  fouls: number;
  mvpAwards: number;
  fairPlayAwards: number;
}

type IdentifiedMatch = MatchDocument & { _id: unknown };

const EMPTY_AGGREGATES: RegistrationAggregates = {
  matchesPlayed: 0,
  wins: 0,
  rankingPoints: 0,
  pointsScored: 0,
  pointsAllowed: 0,
  pointsMade: 0,
  assists: 0,
  fouls: 0,
  mvpAwards: 0,
  fairPlayAwards: 0
};

const sideOf = (match: MatchDocument, registrationId: string): MatchSide | null => {
  for (const team of match.teams) {
    if (team.players.some((player) => String(player.registrationId) === registrationId)) {
      return team.side;
    }
  }
  return null;
};

/**
 * The whole standing of one player, recomputed from scratch.
 *
 * Team numbers come from the match, individual numbers from its report. That
 * layering is deliberate: a match completed by hand has no report, so the match
 * has to stay authoritative for the ranking — which is also what keeps an
 * imprecise attribution from ever distorting a standing.
 */
export const computeAggregates = (
  registrationId: string,
  matches: IdentifiedMatch[],
  reportsByMatchId: Map<string, MatchReportDocument>,
  winPoints: number
): RegistrationAggregates => {
  const aggregates: RegistrationAggregates = { ...EMPTY_AGGREGATES };

  for (const match of matches) {
    const side = sideOf(match, registrationId);
    if (!side) {
      continue;
    }

    const { winnerSide } = resolveMatchOutcome(match, match.scoreA, match.scoreB);
    const ownScore = side === "A" ? match.scoreA : match.scoreB;
    const opponentScore = side === "A" ? match.scoreB : match.scoreA;

    aggregates.matchesPlayed += 1;
    aggregates.pointsScored += ownScore;
    aggregates.pointsAllowed += opponentScore;
    if (winnerSide === side) {
      aggregates.wins += 1;
      aggregates.rankingPoints += winPoints;
    }

    const report = reportsByMatchId.get(String(match._id));
    if (!report) {
      continue;
    }

    const line = report.boxScore.find(
      (candidate) => String(candidate.registrationId) === registrationId
    );
    if (line) {
      aggregates.pointsMade += line.points;
      aggregates.assists += line.assists;
      aggregates.fouls += line.fouls;
    }
    if (String(report.awards.mvpRegistrationId) === registrationId) {
      aggregates.mvpAwards += 1;
    }
    if (String(report.awards.fairPlayRegistrationId) === registrationId) {
      aggregates.fairPlayAwards += 1;
    }
  }

  return aggregates;
};

/**
 * The only writer of the registration counters on the report paths.
 *
 * It $sets rather than $incs, so it is self-healing: a correction that flips the
 * winner needs no reversal logic, and any pre-existing drift for these players
 * is repaired as a side effect.
 */
export const recomputeRegistrationAggregates = async (
  registrationIds: string[],
  tournamentId: string,
  session: ClientSession
): Promise<void> => {
  if (registrationIds.length === 0) {
    return;
  }

  const tournament = await loadTournament(tournamentId, session);
  const matches = (await MatchModel.find({
    tournamentId,
    status: "completed",
    "teams.players.registrationId": { $in: registrationIds }
  }).session(session)) as unknown as IdentifiedMatch[];

  const reports = await MatchReportModel.find({
    matchId: { $in: matches.map((match) => match._id) }
  }).session(session);
  const reportsByMatchId = new Map(reports.map((report) => [String(report.matchId), report]));

  const operations = registrationIds.map((registrationId) => {
    const aggregates = computeAggregates(
      registrationId,
      matches,
      reportsByMatchId,
      tournament.winPoints
    );

    // Mongoose validators do not run on bulkWrite, so min: 0 would not catch a
    // negative here. A negative total means the computation is wrong, and the
    // transaction must not commit.
    for (const [field, value] of Object.entries(aggregates)) {
      if (value < 0) {
        throw new ApiError(
          500,
          `Aggregate recomputation produced a negative value for ${field}`
        );
      }
    }

    return {
      updateOne: {
        filter: { _id: registrationId },
        update: { $set: aggregates }
      }
    };
  });

  await RegistrationModel.bulkWrite(operations, { session });
};
