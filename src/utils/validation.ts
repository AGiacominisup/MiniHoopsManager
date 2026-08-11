import { Types } from "mongoose";
import { z } from "zod";

export const objectIdSchema = z.string().refine((value) => Types.ObjectId.isValid(value), {
  message: "Invalid MongoDB ObjectId"
});

export const idParamsSchema = z.object({
  id: objectIdSchema
});