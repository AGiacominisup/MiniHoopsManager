import type { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { idParamsSchema } from "../../utils/validation";
import { MatchModel } from "../matches/match.model";
import { startMatch } from "../matches/matchQueue.service";
import { assertAssignedReferee } from "../matches/matchReferee.service";
import {
  assertMatchBelongsToScope,
  correctMatchReport,
  loadMatchReport,
  loadRefereeContext,
  submitMatchReport,
  type RefereeScope
} from "./matchReport.service";
import { correctMatchReportSchema, submitMatchReportSchema } from "./matchReport.validation";

const refereeScope = (req: Request): RefereeScope => {
  if (!req.refereeSession) {
    throw new ApiError(401, "Unauthorized");
  }
  // Always the token, never the body or the params.
  return {
    tournamentId: req.refereeSession.tournamentId,
    courtId: req.refereeSession.courtId
  };
};

const requireUserId = (req: Request): string => {
  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }
  return req.user.userId;
};

export const getRefereeContext = async (req: Request, res: Response): Promise<void> => {
  const context = await loadRefereeContext(refereeScope(req));

  res.status(200).json(context);
};

export const startRefereeMatch = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const scope = refereeScope(req);

  const existing = await MatchModel.findById(id);
  if (!existing) {
    throw new ApiError(404, "Match not found");
  }
  assertMatchBelongsToScope(existing, scope);

  const match = await startMatch(id);

  res.status(200).json({ message: "Match started", match });
};

export const submitRefereeMatchReport = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const body = submitMatchReportSchema.parse(req.body);
  const scope = refereeScope(req);

  const result = await submitMatchReport({
    matchId: id,
    body,
    submittedBy: { kind: "referee_session", sessionId: req.refereeSession?.sessionId },
    scope
  });

  res.status(result.idempotent || result.lateReport ? 200 : 201).json({
    message: result.lateReport
      ? "Match report recorded for an already completed match"
      : "Match report submitted",
    report: result.report,
    match: result.match,
    nextMatch: result.nextMatch,
    warnings: result.warnings,
    idempotent: result.idempotent
  });
};

export const submitStaffMatchReport = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const body = submitMatchReportSchema.parse(req.body);
  const userId = requireUserId(req);

  const result = await submitMatchReport({
    matchId: id,
    body,
    submittedBy: { kind: "user", userId }
  });

  res.status(result.idempotent || result.lateReport ? 200 : 201).json({
    message: result.lateReport
      ? "Match report recorded for an already completed match"
      : "Match report submitted",
    report: result.report,
    match: result.match,
    nextMatch: result.nextMatch,
    warnings: result.warnings,
    idempotent: result.idempotent
  });
};

export const startAssignedRefereeMatch = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  await assertAssignedReferee(id, requireUserId(req));
  const match = await startMatch(id);
  res.status(200).json({ message: "Match started", match });
};

export const submitAssignedRefereeMatchReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const body = submitMatchReportSchema.parse(req.body);
  const submitterId = requireUserId(req);
  const assignedMatch = await assertAssignedReferee(id, submitterId);
  if (assignedMatch.status === "completed") {
    throw new ApiError(409, "Completed matches cannot be reported by the referee app");
  }
  const result = await submitMatchReport({
    matchId: id,
    body,
    submittedBy: { kind: "user", userId: submitterId }
  });
  res.status(result.idempotent || result.lateReport ? 200 : 201).json({
    message: result.lateReport
      ? "Match report recorded for an already completed match"
      : "Match report submitted",
    report: result.report,
    match: result.match,
    nextMatch: result.nextMatch,
    warnings: result.warnings,
    idempotent: result.idempotent
  });
};

export const getMatchReport = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const report = await loadMatchReport(id);

  res.status(200).json({ report });
};

export const correctMatchReportHandler = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const body = correctMatchReportSchema.parse(req.body);
  const userId = requireUserId(req);

  const result = await correctMatchReport({ matchId: id, body, userId });

  res.status(200).json({
    message: "Match report corrected",
    report: result.report,
    match: result.match,
    warnings: result.warnings
  });
};
