import { z } from "zod";

const userFields = {
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
  role: z.enum(["admin", "coach", "staff"])
};

export const createUserSchema = z.object(userFields);

export const updateUserSchema = z.object(userFields).partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
);