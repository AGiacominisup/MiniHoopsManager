import { z } from "zod";
import { objectIdSchema } from "../../utils/validation";

export const assignMatchRefereeSchema = z.object({
  refereeUserId: objectIdSchema
});