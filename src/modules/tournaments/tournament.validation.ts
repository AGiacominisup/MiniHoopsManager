import { z } from "zod";

export const createTournamentSchema = z
  .object({
    name: z.string().min(3),
    season: z.string().min(3),
    location: z.string().min(2).optional(),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    ageCategory: z.string().min(2)
  })
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: "endDate must be after startDate",
    path: ["endDate"]
  });
