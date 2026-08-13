import { z } from "zod";

const playerFields = {
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  jerseyNumber: z.number().int().nonnegative().optional(),
  birthDate: z.string().datetime().optional(),
  guardianContact: z.string().trim().min(1).optional(),
  skillRating: z.number().int().min(0).max(10).optional()
};

export const createPlayerSchema = z.object(playerFields).refine(
  (data) => Object.values(data).some((value) => value !== undefined),
  { message: "At least one field is required" }
);

export const updatePlayerSchema = z.object(playerFields).refine(
  (data) => Object.values(data).some((value) => value !== undefined),
  { message: "At least one field is required" }
);