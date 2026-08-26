import { ApiError } from "../../utils/ApiError";
import type { MatchDocument, MatchSide, MatchTeam } from "./match.model";

export interface MatchOutcome {
  teamA: MatchTeam;
  teamB: MatchTeam;
  // null only for a level score, which the format makes impossible: a game is
  // played to a target score and the first side to reach it wins.
  winnerSide: MatchSide | null;
}

const teamBySide = (match: MatchDocument, side: MatchSide): MatchTeam => {
  const team = match.teams.find((candidate) => candidate.side === side);
  if (!team) {
    throw new ApiError(500, `Match is missing team ${side}`);
  }
  return team;
};

// The single definition of "who won". Reading teams positionally instead of by
// side used to credit the wrong three players on any match whose teams were
// stored as [B, A].
export const resolveMatchOutcome = (
  match: MatchDocument,
  scoreA: number,
  scoreB: number
): MatchOutcome => ({
  teamA: teamBySide(match, "A"),
  teamB: teamBySide(match, "B"),
  winnerSide: scoreA === scoreB ? null : scoreA > scoreB ? "A" : "B"
});
