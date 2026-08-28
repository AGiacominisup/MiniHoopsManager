import mongoose, { type ClientSession, type HydratedDocument } from "mongoose";
import { ApiError } from "../../utils/ApiError";
import { MatchModel, type MatchDocument } from "../matches/match.model";
import { completeMatchWithSession } from "../matches/matchQueue.service";
import { recomputeRegistrationAggregates } from "../registrations/registrationAggregates.service";
import { findEnabledCourt, loadTournament } from "../tournaments/tournament.guards";
import {
  MATCH_REPORT_REVISION_LIMIT,
  MatchReportModel,
  type MatchReportDocument,
  type MatchReportSubmitter
} from "./matchReport.model";
import {
  UNATTRIBUTED_POINTS_WARNING,
  buildReportContent,
  reportRegistrationIds
} from "./matchReport.rules";
import type { CorrectMatchReportInput, SubmitMatchReportInput } from "./matchReport.validation";

export type MatchEntity = HydratedDocument<MatchDocument>;
export type MatchReportEntity = HydratedDocument<MatchReportDocument>;

export interface RefereeScope {
  tournamentId: string;
  courtId: string;
}

// The stored shape holds ObjectIds; callers pass ids as strings and let Mongoose
// cast them.
export interface MatchReportSubmitterInput {
  kind: MatchReportSubmitter["kind"];
  sessionId?: string;
  userId?: string;
}

export interface SubmitMatchReportParams {
  matchId: string;
  body: SubmitMatchReportInput;
  submittedBy: MatchReportSubmitterInput;
  scope?: RefereeScope;
}

export interface SubmitMatchReportResult {
  report: MatchReportEntity;
  match: MatchEntity;
  nextMatch: MatchEntity | null;
  warnings: string[];
  idempotent: boolean;
  lateReport: boolean;
}

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === 11000;

const warningsOf = (report: MatchReportEntity): string[] =>
  report.unattributedPointsA + report.unattributedPointsB > 0
    ? [UNATTRIBUTED_POINTS_WARNING]
    : [];

// A court tablet may only act on matches of its own court. The check is on the
// match's own courtId, not on "the current match of my court": a completed match
// keeps its courtId, so a tablet that reconnects two matches later can still
// submit the one it actually kept.
export const assertMatchBelongsToScope = (match: MatchDocument, scope?: RefereeScope): void => {
  if (!scope) {
    return;
  }
  if (
    String(match.tournamentId) !== scope.tournamentId ||
    String(match.courtId) !== scope.courtId
  ) {
    throw new ApiError(403, "Match does not belong to the bound court");
  }
};

const loadMatchForScope = async (
  matchId: string,
  scope: RefereeScope | undefined,
  session: ClientSession
): Promise<MatchEntity> => {
  const match = await MatchModel.findById(matchId).session(session);
  if (!match) {
    throw new ApiError(404, "Match not found");
  }
  assertMatchBelongsToScope(match, scope);
  return match;
};

export const submitMatchReport = async (
  params: SubmitMatchReportParams
): Promise<SubmitMatchReportResult> => {
  const { matchId, body, submittedBy, scope } = params;
  const session = await mongoose.startSession();

  try {
    let result: SubmitMatchReportResult | undefined;

    await session.withTransaction(async () => {
      // Replaying a submission must look like success, or the scorekeeper keeps
      // tapping Submit on a report that already landed.
      const replayed = await MatchReportModel.findOne({
        submissionId: body.submissionId
      }).session(session);
      if (replayed) {
        if (String(replayed.matchId) !== matchId) {
          throw new ApiError(409, "submissionId already used for another match");
        }
        const match = await loadMatchForScope(matchId, scope, session);
        result = {
          report: replayed,
          match,
          nextMatch: null,
          warnings: warningsOf(replayed),
          idempotent: true,
          lateReport: false
        };
        return;
      }

      const match = await loadMatchForScope(matchId, scope, session);

      // A report for a match staff already closed by hand is the better
      // evidence, so it is accepted — but the court moved on, so nothing else
      // about the schedule may change.
      let lateReport = false;
      if (match.status === "completed") {
        const existing = await MatchReportModel.exists({ matchId }).session(session);
        if (existing) {
          throw new ApiError(409, "A different report was already submitted for this match");
        }
        lateReport = true;
      } else if (match.status !== "ready" && match.status !== "in_progress") {
        throw new ApiError(409, "Only a ready or in-progress match can be reported");
      }

      const content = buildReportContent(match, body);
      const [report] = await MatchReportModel.create(
        [
          {
            matchId,
            tournamentId: match.tournamentId,
            courtId: match.courtId,
            submissionId: body.submissionId,
            scoreA: body.scoreA,
            scoreB: body.scoreB,
            unattributedPointsA: content.unattributedPointsA,
            unattributedPointsB: content.unattributedPointsB,
            baskets: content.baskets,
            fouls: content.fouls,
            boxScore: content.boxScore,
            awards: content.awards,
            submittedBy,
            submittedAt: new Date(),
            revision: 0,
            corrections: []
          }
        ],
        { session }
      );

      let nextMatch: MatchEntity | null = null;
      if (lateReport) {
        match.set({ scoreA: body.scoreA, scoreB: body.scoreB });
        await match.save({ session });
      } else {
        const completion = await completeMatchWithSession(
          matchId,
          body.scoreA,
          body.scoreB,
          session,
          { skipRegistrationAggregates: true }
        );
        nextMatch = completion.nextMatch;
      }

      await recomputeRegistrationAggregates(
        reportRegistrationIds(match),
        String(match.tournamentId),
        session
      );

      result = {
        report,
        match,
        nextMatch,
        warnings: content.warnings,
        idempotent: false,
        lateReport
      };
    });

    if (!result) {
      throw new ApiError(500, "Match report submission did not run");
    }
    return result;
  } catch (error: unknown) {
    // Two concurrent retries both pass the replay check and both insert; the
    // loser lands here and must still see success.
    if (isDuplicateKeyError(error)) {
      const existing = await MatchReportModel.findOne({ submissionId: body.submissionId });
      if (existing && String(existing.matchId) === matchId) {
        const match = await MatchModel.findById(matchId);
        if (match) {
          return {
            report: existing,
            match,
            nextMatch: null,
            warnings: warningsOf(existing),
            idempotent: true,
            lateReport: false
          };
        }
      }
      throw new ApiError(409, "A different report was already submitted for this match");
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

export interface CorrectMatchReportParams {
  matchId: string;
  body: CorrectMatchReportInput;
  userId: string;
}

export interface CorrectMatchReportResult {
  report: MatchReportEntity;
  match: MatchEntity;
  warnings: string[];
}

/**
 * Rewrites a completed result from the back office.
 *
 * This is the only path on which a completed match changes: it never reserves a
 * next match, never touches the match status or its timestamps, and never moves
 * the tournament status — correcting the standings of a completed tournament is
 * the main reason it exists.
 */
export const correctMatchReport = async (
  params: CorrectMatchReportParams
): Promise<CorrectMatchReportResult> => {
  const { matchId, body, userId } = params;
  const session = await mongoose.startSession();

  try {
    let result: CorrectMatchReportResult | undefined;

    await session.withTransaction(async () => {
      const match = await MatchModel.findById(matchId).session(session);
      if (!match) {
        throw new ApiError(404, "Match not found");
      }
      if (match.status !== "completed") {
        throw new ApiError(409, "Only a completed match can be corrected");
      }

      if (match.phase === "qualification") {
        const tournament = await loadTournament(String(match.tournamentId), session);
        if (
          tournament.status === "finals" ||
          (tournament.status === "completed" && (tournament.finals?.totalMatches ?? 0) > 0)
        ) {
          throw new ApiError(
            409,
            "Qualification reports cannot be corrected after finals have been generated"
          );
        }
      }

      const content = buildReportContent(match, body);
      const existing = await MatchReportModel.findOne({ matchId }).session(session);

      let report: MatchReportEntity;
      if (existing) {
        if (existing.corrections.length >= MATCH_REPORT_REVISION_LIMIT) {
          throw new ApiError(409, "Match report revision limit reached");
        }

        // The superseded state is kept in full: it is the audit trail, and the
        // only way to explain a changed standing later.
        const updated = await MatchReportModel.findOneAndUpdate(
          { _id: existing._id, revision: existing.revision },
          {
            $set: {
              scoreA: body.scoreA,
              scoreB: body.scoreB,
              unattributedPointsA: content.unattributedPointsA,
              unattributedPointsB: content.unattributedPointsB,
              baskets: content.baskets,
              fouls: content.fouls,
              boxScore: content.boxScore,
              awards: content.awards
            },
            $inc: { revision: 1 },
            $push: {
              corrections: {
                revision: existing.revision,
                correctedBy: userId,
                correctedAt: new Date(),
                note: body.note,
                previousScoreA: existing.scoreA,
                previousScoreB: existing.scoreB,
                previousBaskets: existing.baskets,
                previousFouls: existing.fouls,
                previousAwards: existing.awards
              }
            }
          },
          { new: true, runValidators: true, session }
        );
        if (!updated) {
          throw new ApiError(409, "Match report was modified concurrently");
        }
        report = updated;
      } else {
        // A match closed by hand has no report: this is how it gets a box score.
        const [created] = await MatchReportModel.create(
          [
            {
              matchId,
              tournamentId: match.tournamentId,
              courtId: match.courtId,
              submissionId: `staff:${String(match._id)}`,
              scoreA: body.scoreA,
              scoreB: body.scoreB,
              unattributedPointsA: content.unattributedPointsA,
              unattributedPointsB: content.unattributedPointsB,
              baskets: content.baskets,
              fouls: content.fouls,
              boxScore: content.boxScore,
              awards: content.awards,
              submittedBy: { kind: "user", userId },
              submittedAt: new Date(),
              revision: 0,
              corrections: []
            }
          ],
          { session }
        );
        report = created;
      }

      // Only the score: rewriting completedAt would degrade the rest heuristic
      // of every later court assignment.
      await MatchModel.updateOne(
        { _id: matchId },
        { $set: { scoreA: body.scoreA, scoreB: body.scoreB } },
        { session }
      );

      await recomputeRegistrationAggregates(
        reportRegistrationIds(match),
        String(match.tournamentId),
        session
      );

      const refreshed = await MatchModel.findById(matchId).session(session);
      result = { report, match: refreshed ?? match, warnings: content.warnings };
    });

    if (!result) {
      throw new ApiError(500, "Match report correction did not run");
    }
    return result;
  } finally {
    await session.endSession();
  }
};

export const loadMatchReport = async (matchId: string): Promise<MatchReportEntity> => {
  const report = await MatchReportModel.findOne({ matchId });
  if (!report) {
    throw new ApiError(404, "Match report not found");
  }
  return report;
};

export interface RefereeContext {
  tournament: { _id: string; name: string; status: string; winPoints: number };
  court: { _id: string; name: string };
  match: MatchEntity | null;
  report: {
    submitted: true;
    revision: number;
    submittedAt: Date;
    scoreA: number;
    scoreB: number;
  } | null;
}

export const loadRefereeContext = async (scope: RefereeScope): Promise<RefereeContext> => {
  const tournament = await loadTournament(scope.tournamentId);
  const court = findEnabledCourt(tournament, scope.courtId);

  // Exactly the key of the partial unique index on (tournamentId, courtId), so
  // at most one match can match: no ordering and no tie-break needed.
  const match = await MatchModel.findOne({
    tournamentId: scope.tournamentId,
    courtId: scope.courtId,
    status: { $in: ["ready", "in_progress"] }
  });

  const report = match ? await MatchReportModel.findOne({ matchId: match._id }) : null;

  return {
    tournament: {
      _id: String(tournament._id),
      name: tournament.name,
      status: tournament.status,
      winPoints: tournament.winPoints
    },
    court: { _id: String(court._id), name: court.name },
    match,
    report: report
      ? {
          submitted: true,
          revision: report.revision,
          submittedAt: report.submittedAt,
          scoreA: report.scoreA,
          scoreB: report.scoreB
        }
      : null
  };
};
