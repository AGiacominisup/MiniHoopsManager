import { z } from "zod";
import { objectIdSchema } from "../../utils/validation";

const matchPlayerSchema = z
  .object({
    registrationId: objectIdSchema,
    jerseyNumber: z.number().int().nonnegative().optional(),
    name: z.string().trim().min(1).optional()
  })
  .refine((player) => player.jerseyNumber !== undefined || player.name !== undefined, {
    message: "Each match player must have either a jersey number or a name"
  });

const matchTeamSchema = z.object({
  side: z.enum(["A", "B"]),
  players: z.array(matchPlayerSchema).length(3)
});

const matchFields = {
  tournamentId: objectIdSchema,
  courtId: objectIdSchema,
  finalGroupId: objectIdSchema.nullable().optional(),
  phase: z.enum(["qualification", "final"]),
  scheduledAt: z.string().datetime(),
  status: z.enum(["scheduled", "queued", "ready", "in_progress", "completed"]).optional(),
  scoreA: z.number().int().nonnegative().optional(),
  scoreB: z.number().int().nonnegative().optional(),
  teams: z
    .array(matchTeamSchema)
    .length(2)
    .refine((teams) => new Set(teams.map((team) => team.side)).size === 2, {
      message: "Teams must contain sides A and B"
    })
    .refine(
      (teams) => {
        const ids = teams.flatMap((team) => team.players.map((player) => player.registrationId));
        return new Set(ids).size === ids.length;
      },
      { message: "A registration can appear only once in a match" }
    )
};

export const createMatchSchema = z.object(matchFields);

export const updateMatchSchema = z.object(matchFields).partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
);

export const matchQuerySchema = z.object({
  tournamentId: objectIdSchema.optional(),
  phase: z.enum(["qualification", "final"]).optional(),
  status: z
    .enum(["scheduled", "queued", "ready", "in_progress", "completed"])
    .optional()
});

export const assignMatchSchema = z.object({
  courtId: objectIdSchema
});

export const completeMatchSchema = z
  .object({
    scoreA: z.number().int().nonnegative(),
    scoreB: z.number().int().nonnegative()
  })
  .refine((body) => body.scoreA !== body.scoreB, {
    message: "Draws are not supported in the current tournament format"
  });