import { z } from "zod";
import { COURT_CODE_LENGTH, normalizeCourtCode } from "./courtCode";

export const refereeSessionSchema = z.object({
  // Accepts the displayed XXXX-XXXX form as well as the bare characters.
  code: z
    .string()
    .trim()
    .min(1)
    .transform(normalizeCourtCode)
    .refine((code) => code.length === COURT_CODE_LENGTH, {
      message: `A court access code has ${COURT_CODE_LENGTH} characters`
    })
});

export const rotateCourtCodeQuerySchema = z.object({
  force: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true")
});
