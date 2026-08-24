import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const refereeRegistrationSchema = loginSchema.extend({
  name: z.string().trim().min(1).max(80)
});
