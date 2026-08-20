import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { HydratedDocument } from "mongoose";
import { jwtConfig } from "../../config/jwt";
import { ApiError } from "../../utils/ApiError";
import { findCourt, findEnabledCourt, loadTournament } from "../tournaments/tournament.guards";
import { TournamentModel } from "../tournaments/tournament.model";
import { CodeAttemptModel } from "./codeAttempt.model";
import { CourtAccessCodeModel, type CourtAccessCodeDocument } from "./courtAccessCode.model";
import { generateCourtCode, hashCourtCode, normalizeCourtCode } from "./courtCode";

const MAX_CODE_FAILURES = 10;
const LOCKOUT_MS = 15 * 60 * 1000;
const CODE_ALLOCATION_ATTEMPTS = 10;

export interface RefereeJwtPayload {
  kind: "referee";
  sessionId: string;
  tournamentId: string;
  courtId: string;
  tokenVersion: number;
}

export interface CourtAccessSummary {
  tournamentId: string;
  courtId: string;
  courtName: string;
  hasActiveCode: boolean;
  codeLast4: string;
  tokenVersion: number;
  issuedTokenCount: number;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type CourtAccessEntity = HydratedDocument<CourtAccessCodeDocument>;

// The code itself and its hash are never part of a response: the plaintext is
// returned exactly once, by issueCourtAccessCode.
const serializeCourtAccess = (
  access: CourtAccessEntity,
  courtName: string
): CourtAccessSummary => ({
  tournamentId: String(access.tournamentId),
  courtId: String(access.courtId),
  courtName,
  hasActiveCode: access.revokedAt === null,
  codeLast4: access.codeLast4,
  tokenVersion: access.tokenVersion,
  issuedTokenCount: access.issuedTokenCount,
  lastUsedAt: access.lastUsedAt,
  revokedAt: access.revokedAt,
  createdAt: access.createdAt,
  updatedAt: access.updatedAt
});

export const assertCodeAttemptAllowed = async (key: string): Promise<void> => {
  const attempt = await CodeAttemptModel.findOne({ key });
  if (attempt?.lockedUntil && attempt.lockedUntil > new Date()) {
    throw new ApiError(429, "Too many court code attempts");
  }
};

const registerCodeFailure = async (key: string): Promise<void> => {
  const now = new Date();
  const attempt = await CodeAttemptModel.findOneAndUpdate(
    { key },
    {
      $inc: { failures: 1 },
      $set: { expiresAt: new Date(now.getTime() + LOCKOUT_MS) }
    },
    { new: true, upsert: true }
  );

  if (attempt.failures >= MAX_CODE_FAILURES) {
    await CodeAttemptModel.updateOne(
      { key },
      { $set: { failures: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MS) } }
    );
  }
};

const resetCodeAttempts = async (key: string): Promise<void> => {
  await CodeAttemptModel.deleteOne({ key });
};

// Every token issued since the current code was created is invalidated by a
// rotation, so this is exactly the number of devices that will be unpaired.
const pairedDeviceCount = (access: CourtAccessEntity): number =>
  access.revokedAt === null ? access.issuedTokenCount : 0;

export const issueCourtAccessCode = async (
  tournamentId: string,
  courtId: string,
  createdBy: string,
  force: boolean
): Promise<{ code: string; courtAccess: CourtAccessSummary; unpairedDevices: number }> => {
  const tournament = await loadTournament(tournamentId);
  if (tournament.status === "completed") {
    throw new ApiError(409, "Tournament is completed");
  }
  const court = findEnabledCourt(tournament, courtId);

  const existing = await CourtAccessCodeModel.findOne({ tournamentId, courtId });
  const unpairedDevices = existing ? pairedDeviceCount(existing) : 0;
  // Rotating a code 401s every tablet on that court at its next request, which
  // for a scorekeeper mid-game means an unsendable report. Make that explicit.
  if (unpairedDevices > 0 && !force) {
    throw new ApiError(
      409,
      `Court has ${unpairedDevices} paired device(s); repeat with force=true to rotate the code`
    );
  }

  let code = "";
  let codeHash = "";
  for (let attempt = 0; attempt < CODE_ALLOCATION_ATTEMPTS; attempt += 1) {
    const candidate = generateCourtCode();
    const candidateHash = hashCourtCode(candidate);
    const collision = await CourtAccessCodeModel.exists({
      codeHash: candidateHash,
      revokedAt: null
    });
    if (!collision) {
      code = candidate;
      codeHash = candidateHash;
      break;
    }
  }
  if (!code) {
    throw new ApiError(503, "Could not allocate a court access code");
  }

  let access: CourtAccessEntity;
  if (existing) {
    existing.set({
      codeHash,
      codeLast4: code.slice(-4),
      tokenVersion: existing.tokenVersion + 1,
      revokedAt: null,
      lastUsedAt: null,
      issuedTokenCount: 0,
      createdBy
    });
    access = await existing.save();
  } else {
    access = await CourtAccessCodeModel.create({
      tournamentId,
      courtId,
      codeHash,
      codeLast4: code.slice(-4),
      createdBy
    });
  }

  return {
    code,
    courtAccess: serializeCourtAccess(access, court.name),
    unpairedDevices
  };
};

export const revokeCourtAccessCode = async (
  tournamentId: string,
  courtId: string
): Promise<void> => {
  const tournament = await loadTournament(tournamentId);
  findEnabledCourt(tournament, courtId);

  // Bumping tokenVersion is what invalidates the already-issued stateless JWTs:
  // requireRefereeSession compares the claim against this value on every call.
  const access = await CourtAccessCodeModel.findOneAndUpdate(
    { tournamentId, courtId, revokedAt: null },
    { $set: { revokedAt: new Date() }, $inc: { tokenVersion: 1 } },
    { new: true }
  );
  if (!access) {
    throw new ApiError(404, "Court access code not found");
  }
};

export const listCourtAccesses = async (tournamentId: string): Promise<CourtAccessSummary[]> => {
  const tournament = await loadTournament(tournamentId);
  const accesses = await CourtAccessCodeModel.find({ tournamentId });
  const courtNameById = new Map(
    tournament.courts.map((court) => [
      String((court as typeof court & { _id: unknown })._id),
      court.name
    ])
  );

  return accesses.map((access) =>
    serializeCourtAccess(access, courtNameById.get(String(access.courtId)) ?? "Unknown court")
  );
};

const signRefereeToken = (access: CourtAccessEntity): { token: string; sessionId: string } => {
  const sessionId = randomUUID();
  const payload: RefereeJwtPayload = {
    kind: "referee",
    sessionId,
    tournamentId: String(access.tournamentId),
    courtId: String(access.courtId),
    tokenVersion: access.tokenVersion
  };

  return {
    sessionId,
    token: jwt.sign(payload, jwtConfig.secret, {
      algorithm: jwtConfig.algorithm,
      expiresIn: jwtConfig.expiresIn
    })
  };
};

export interface RefereeSessionResult {
  token: string;
  expiresAt: Date;
  tournament: { _id: string; name: string; status: string };
  court: { _id: string; name: string };
}

export const exchangeCourtCode = async (
  code: string,
  throttleKey: string
): Promise<RefereeSessionResult> => {
  await assertCodeAttemptAllowed(throttleKey);

  // One identical 401 for an unknown code, a revoked code and a tournament that
  // is not accepting reports: nothing tells a guesser they found a real code.
  const invalidCode = async (): Promise<never> => {
    await registerCodeFailure(throttleKey);
    throw new ApiError(401, "Invalid court access code");
  };

  const codeHash = hashCourtCode(normalizeCourtCode(code));
  const access = await CourtAccessCodeModel.findOne({ codeHash, revokedAt: null });
  if (!access) {
    return invalidCode();
  }

  // A deleted tournament must answer like an unknown code, not with a 404 that
  // confirms the code was real.
  const tournament = await TournamentModel.findById(access.tournamentId);
  if (!tournament || tournament.status === "draft" || tournament.status === "completed") {
    return invalidCode();
  }

  const court = findCourt(tournament, String(access.courtId));
  if (!court || !court.enabled) {
    return invalidCode();
  }

  const { token } = signRefereeToken(access);
  await CourtAccessCodeModel.updateOne(
    { _id: access._id },
    { $set: { lastUsedAt: new Date() }, $inc: { issuedTokenCount: 1 } }
  );
  await resetCodeAttempts(throttleKey);

  const decoded = jwt.decode(token) as { exp: number };

  return {
    token,
    expiresAt: new Date(decoded.exp * 1000),
    tournament: {
      _id: String(tournament._id),
      name: tournament.name,
      status: tournament.status
    },
    court: { _id: String(access.courtId), name: court.name }
  };
};
