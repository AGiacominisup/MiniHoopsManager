import { ApiError } from "../../utils/ApiError";
import type { MatchDocument, MatchSide } from "../matches/match.model";
import type { MatchReportBodyInput } from "./matchReport.validation";

export interface DerivedBasket {
  side: MatchSide;
  registrationId: string;
  points: number;
  assistRegistrationId: string | null;
  clientSequence: number;
  clientRecordedAt?: Date;
}

export interface DerivedFoul {
  side: MatchSide;
  registrationId: string;
  clientSequence: number;
  clientRecordedAt?: Date;
}

export interface DerivedPlayerLine {
  registrationId: string;
  side: MatchSide;
  points: number;
  onePointers: number;
  twoPointers: number;
  assists: number;
  fouls: number;
}

export interface DerivedReportContent {
  baskets: DerivedBasket[];
  fouls: DerivedFoul[];
  boxScore: DerivedPlayerLine[];
  unattributedPointsA: number;
  unattributedPointsB: number;
  awards: {
    mvpRegistrationId: string | null;
    fairPlayRegistrationId: string | null;
  };
  warnings: string[];
}

export const UNATTRIBUTED_POINTS_WARNING = "unattributedPoints";

const sideByRegistrationId = (match: MatchDocument): Map<string, MatchSide> => {
  const sides = new Map<string, MatchSide>();
  for (const team of match.teams) {
    for (const player of team.players) {
      sides.set(String(player.registrationId), team.side);
    }
  }

  if (sides.size !== 6) {
    throw new ApiError(500, "Match does not hold six distinct players");
  }

  return sides;
};

/**
 * Turns a submitted report into what gets stored, and rejects anything that
 * would poison the box score.
 *
 * The team score is authoritative and the attribution is best-effort: points
 * the scorekeeper could not attribute are kept as an explicit remainder, while
 * attributing *more* than the score is an unambiguous input error.
 */
export const buildReportContent = (
  match: MatchDocument,
  body: MatchReportBodyInput
): DerivedReportContent => {
  const sides = sideByRegistrationId(match);

  const requireMember = (registrationId: string, label: string): MatchSide => {
    const side = sides.get(registrationId);
    if (!side) {
      throw new ApiError(400, label);
    }
    return side;
  };

  const baskets: DerivedBasket[] = body.baskets.map((basket) => {
    const side = requireMember(
      basket.registrationId,
      `Event registrationId ${basket.registrationId} is not part of this match`
    );

    let assistRegistrationId: string | null = null;
    if (basket.assistRegistrationId) {
      const assistSide = requireMember(
        basket.assistRegistrationId,
        `Assist registrationId ${basket.assistRegistrationId} is not part of this match`
      );
      if (assistSide !== side) {
        throw new ApiError(400, "An assist must be credited to a teammate of the scorer");
      }
      assistRegistrationId = basket.assistRegistrationId;
    }

    return {
      side,
      registrationId: basket.registrationId,
      points: basket.points,
      assistRegistrationId,
      clientSequence: basket.clientSequence,
      ...(basket.clientRecordedAt && { clientRecordedAt: new Date(basket.clientRecordedAt) })
    };
  });

  const fouls: DerivedFoul[] = body.fouls.map((foul) => ({
    side: requireMember(
      foul.registrationId,
      `Event registrationId ${foul.registrationId} is not part of this match`
    ),
    registrationId: foul.registrationId,
    clientSequence: foul.clientSequence,
    ...(foul.clientRecordedAt && { clientRecordedAt: new Date(foul.clientRecordedAt) })
  }));

  const mvpRegistrationId = body.awards.mvpRegistrationId ?? null;
  const fairPlayRegistrationId = body.awards.fairPlayRegistrationId ?? null;
  if (mvpRegistrationId) {
    requireMember(mvpRegistrationId, "MVP must be a player of this match");
  }
  if (fairPlayRegistrationId) {
    requireMember(fairPlayRegistrationId, "Fair play award must be a player of this match");
  }

  const attributed = { A: 0, B: 0 };
  for (const basket of baskets) {
    attributed[basket.side] += basket.points;
  }
  if (attributed.A > body.scoreA) {
    throw new ApiError(400, "Attributed points exceed the reported score for side A");
  }
  if (attributed.B > body.scoreB) {
    throw new ApiError(400, "Attributed points exceed the reported score for side B");
  }

  const boxScore: DerivedPlayerLine[] = [];
  for (const team of match.teams) {
    for (const player of team.players) {
      const registrationId = String(player.registrationId);
      const playerBaskets = baskets.filter((basket) => basket.registrationId === registrationId);

      boxScore.push({
        registrationId,
        side: team.side,
        points: playerBaskets.reduce((total, basket) => total + basket.points, 0),
        onePointers: playerBaskets.filter((basket) => basket.points === 1).length,
        twoPointers: playerBaskets.filter((basket) => basket.points === 2).length,
        assists: baskets.filter((basket) => basket.assistRegistrationId === registrationId).length,
        fouls: fouls.filter((foul) => foul.registrationId === registrationId).length
      });
    }
  }

  const unattributedPointsA = body.scoreA - attributed.A;
  const unattributedPointsB = body.scoreB - attributed.B;

  return {
    baskets,
    fouls,
    boxScore,
    unattributedPointsA,
    unattributedPointsB,
    awards: { mvpRegistrationId, fairPlayRegistrationId },
    warnings:
      unattributedPointsA + unattributedPointsB > 0 ? [UNATTRIBUTED_POINTS_WARNING] : []
  };
};

export const reportRegistrationIds = (match: MatchDocument): string[] =>
  match.teams.flatMap((team) => team.players.map((player) => String(player.registrationId)));
