import { z } from "zod";
import { jerseyNumberSchema, objectIdSchema } from "../../utils/validation";

const registrationFields = {
  tournamentId: objectIdSchema,
  playerId: objectIdSchema,
  jerseyNumber: jerseyNumberSchema,
  skillRating: z.number().int().min(0).max(10).optional(),
  rankingPoints: z.number().int().nonnegative().optional(),
  matchesPlayed: z.number().int().nonnegative().optional(),
  wins: z.number().int().nonnegative().optional(),
  pointsScored: z.number().int().nonnegative().optional(),
  pointsAllowed: z.number().int().nonnegative().optional(),
  finalGroupId: objectIdSchema.nullable().optional()
};

export const createRegistrationSchema = z.object(registrationFields);

export const updateRegistrationSchema = z.object(registrationFields).partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
);

export const registrationQuerySchema = z.object({
  tournamentId: objectIdSchema.optional(),
  playerId: objectIdSchema.optional()
});

export const attendanceSchema = z.object({
  attendanceStatus: z.enum(["checked_in", "withdrawn"])
});