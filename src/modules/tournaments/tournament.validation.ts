import { z } from "zod";

const tournamentFields = {
  name: z.string().trim().min(3),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  category: z.string().trim().min(2).optional(),
  winPoints: z.number().int().min(1).optional(),
  status: z.enum(["planned", "in_progress", "completed"]).optional(),
  courts: z
    .array(
      z.object({
        name: z.string().trim().min(1)
      })
    )
    .optional(),
  finalGroups: z
    .array(
      z.object({
        themeName: z.string().trim().min(1),
        level: z.number().int().min(1)
      })
    )
    .optional()
};

export const createTournamentSchema = z
  .object(tournamentFields)
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: "endDate must be after startDate",
    path: ["endDate"]
  });

export const updateTournamentSchema = z.object(tournamentFields).partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
);
