import { z } from "zod";
import { objectIdSchema } from "../../utils/validation";

const tournamentFields = {
  name: z.string().trim().min(3),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  category: z.string().trim().min(2).optional(),
  winPoints: z.number().int().min(1).optional(),
  courts: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        enabled: z.boolean().optional(),
        displayOrder: z.number().int().nonnegative().optional()
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
    .optional(),
  configuration: z
    .object({
      gameFormat: z.literal("3v3").optional(),
      competitionFormat: z.literal("individual_rotating_teams").optional(),
      teamSize: z.literal(3).optional(),
      playersPerMatch: z.literal(6).optional(),
      qualificationAppearancesPerPlayer: z.number().int().min(1).max(20),
      queueMode: z.literal("dynamic").optional()
    })
    .optional()
};

export const qualificationPreviewSchema = z.object({
  seed: z.string().trim().min(1).max(100).optional()
});

export const tournamentStartSchema = z.object({
  seed: z.string().trim().min(1).max(100).optional()
});

export const qualificationGenerateSchema = z.object({
  seed: z.string().trim().min(1).max(100),
  rosterFingerprint: z.string().regex(/^[a-f0-9]{64}$/, "Invalid SHA-256 fingerprint")
});

export const bulkTournamentRegistrationsSchema = z.object({
  playerIds: z.array(objectIdSchema).min(1).max(200)
});

export const bulkAttendanceSchema = z.object({
  attendanceStatus: z.enum(["checked_in", "withdrawn"]),
  registrationIds: z.array(objectIdSchema).min(1).max(500).optional()
});

export const createTournamentSchema = z
  .object(tournamentFields)
  .refine(
    (data) =>
      !data.startDate || !data.endDate || new Date(data.endDate) >= new Date(data.startDate),
    {
      message: "endDate must be after startDate",
      path: ["endDate"]
    }
  );

export const updateTournamentSchema = z.object(tournamentFields).partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
);
