import { z } from "zod";
import { objectIdSchema } from "../../utils/validation";

const MAX_BASKETS = 200;
const MAX_FOULS = 60;

const basketInputSchema = z.object({
  registrationId: objectIdSchema,
  // A literal union rather than a range: 0 and 3 are rejected by the type.
  points: z.union([z.literal(1), z.literal(2)]),
  assistRegistrationId: objectIdSchema.nullable().optional(),
  clientSequence: z.number().int().nonnegative(),
  clientRecordedAt: z.string().datetime().optional()
});

const foulInputSchema = z.object({
  registrationId: objectIdSchema,
  clientSequence: z.number().int().nonnegative(),
  clientRecordedAt: z.string().datetime().optional()
});

const awardsInputSchema = z
  .object({
    mvpRegistrationId: objectIdSchema.nullable().optional(),
    fairPlayRegistrationId: objectIdSchema.nullable().optional()
  })
  .default({});

const matchReportFields = {
  // The reported team score is authoritative. Attribution is best-effort, so it
  // is cross-checked against this rather than replacing it.
  scoreA: z.number().int().nonnegative(),
  scoreB: z.number().int().nonnegative(),
  baskets: z.array(basketInputSchema).max(MAX_BASKETS).default([]),
  fouls: z.array(foulInputSchema).max(MAX_FOULS).default([]),
  awards: awardsInputSchema
};

export type MatchReportBasketInput = z.infer<typeof basketInputSchema>;
export type MatchReportFoulInput = z.infer<typeof foulInputSchema>;

export interface MatchReportBodyInput {
  scoreA: number;
  scoreB: number;
  baskets: MatchReportBasketInput[];
  fouls: MatchReportFoulInput[];
  awards: {
    mvpRegistrationId?: string | null;
    fairPlayRegistrationId?: string | null;
  };
}

// Shared by submission and correction, so the back office cannot record
// anything the tablet is unable to record.
const refineReportBody = (body: MatchReportBodyInput, ctx: z.RefinementCtx): void => {
  // A game is played to a target score and the first side to reach it wins, so
  // a level score is an input error, not a result.
  if (body.scoreA === body.scoreB) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scoreA"],
      message: "Draws are not supported in the current tournament format"
    });
  }

  const sequences = [...body.baskets, ...body.fouls].map((event) => event.clientSequence);
  if (new Set(sequences).size !== sequences.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["baskets"],
      message: "clientSequence must be unique inside a report"
    });
  }

  body.baskets.forEach((basket, index) => {
    if (basket.assistRegistrationId && basket.assistRegistrationId === basket.registrationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["baskets", index, "assistRegistrationId"],
        message: "An assist cannot be credited to the scorer"
      });
    }
  });
};

export const submitMatchReportSchema = z
  .object({
    ...matchReportFields,
    // Minted once by the client when Submit is tapped and replayed verbatim on
    // every retry.
    submissionId: z.string().uuid()
  })
  .superRefine(refineReportBody);

export const correctMatchReportSchema = z
  .object({
    ...matchReportFields,
    // A correction rewrites a completed result, so it must be explainable.
    note: z.string().trim().min(1).max(500)
  })
  .superRefine(refineReportBody);

export type SubmitMatchReportInput = z.infer<typeof submitMatchReportSchema>;
export type CorrectMatchReportInput = z.infer<typeof correctMatchReportSchema>;
