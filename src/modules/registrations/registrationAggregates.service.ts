import type { ClientSession } from "mongoose";
import { ApiError } from "../../utils/ApiError";
import type { MatchDocument, MatchSide } from "../matches/match.model";
import { MatchModel } from "../matches/match.model";
import { resolveMatchOutcome } from "../matches/matchOutcome";
import { MatchReportModel, type MatchReportDocument } from "../matchReports/matchReport.model";
import { RegistrationModel } from "./registration.model";
import { computeRankingPoints, type RankingInputs } from "./rankingFormula";

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
 * Team numbers come from the match, individual numbers from its report.
 * Display counters (`matchesPlayed`, `wins`, box-score totals) cover every
 * completed match. `rankingPoints` is derived only from qualification matches,
 * so a final report never moves the standing used to seat the finals.
 */
export const computeAggregates = (
  registrationId: string,
  matches: IdentifiedMatch[],
  reportsByMatchId: Map<string, MatchReportDocument>
): RegistrationAggregates => {
  const aggregates: RegistrationAggregates = { ...EMPTY_AGGREGATES };
  const rankingInputs: RankingInputs = {
    wins: 0,
    mvpAwards: 0,
    fairPlayAwards: 0,
    pointsMade: 0,
    assists: 0,
    fouls: 0
  };

  for (const match of matches) {
    const side = sideOf(match, registrationId);
    if (!side) {
      continue;
    }

    const { winnerSide } = resolveMatchOutcome(match, match.scoreA, match.scoreB);
    const ownScore = side === "A" ? match.scoreA : match.scoreB;
    const opponentScore = side === "A" ? match.scoreB : match.scoreA;
    const countsForRanking = match.phase !== "final";

    aggregates.matchesPlayed += 1;
    aggregates.pointsScored += ownScore;
    aggregates.pointsAllowed += opponentScore;
    if (winnerSide === side) {
      aggregates.wins += 1;
      if (countsForRanking) {
        rankingInputs.wins += 1;
      }
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
      if (countsForRanking) {
        rankingInputs.pointsMade += line.points;
        rankingInputs.assists += line.assists;
        rankingInputs.fouls += line.fouls;
      }
    }
    if (String(report.awards.mvpRegistrationId) === registrationId) {
      aggregates.mvpAwards += 1;
      if (countsForRanking) {
        rankingInputs.mvpAwards += 1;
      }
    }
    if (String(report.awards.fairPlayRegistrationId) === registrationId) {
      aggregates.fairPlayAwards += 1;
      if (countsForRanking) {
        rankingInputs.fairPlayAwards += 1;
      }
    }
  }

  aggregates.rankingPoints = computeRankingPoints(rankingInputs);
  return aggregates;
};

/**
 * The only writer of the registration counters on the report and completion paths.
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
    const aggregates = computeAggregates(registrationId, matches, reportsByMatchId);

    // Mongoose validators do not run on bulkWrite, so min: 0 would not catch a
    // negative here. A negative total means the computation is wrong, and the
    // transaction must not commit. rankingPoints is clamped to 0 by the formula.
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
