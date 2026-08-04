import { z } from "zod";

export const createTournamentSchema = z
  .object({
    name: z.string().min(3),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    category: z.string().min(2).optional(),
    winPoints: z.number().int().min(1).optional(),
    status: z.enum(["planned", "in_progress", "completed"]).optional(),
    courts: z
      .array(
        z.object({
          name: z.string().min(1)
        })
      )
      .optional(),
    finalGroups: z
      .array(
        z.object({
          themeName: z.string().min(1),
          level: z.number().int().min(1)
        })
      )
      .optional()
  })
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: "endDate must be after startDate",
    path: ["endDate"]
  });
