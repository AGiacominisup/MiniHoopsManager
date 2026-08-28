import { Types } from "mongoose";
import { z } from "zod";

export const objectIdSchema = z.string().refine((value) => Types.ObjectId.isValid(value), {
  message: "Invalid MongoDB ObjectId"
});

export const idParamsSchema = z.object({
  id: objectIdSchema
});

export const tournamentCourtParamsSchema = z.object({
  id: objectIdSchema,
  courtId: objectIdSchema
});

/**
 * Jersey numbers are strings so "00" stays distinct from "0". 1 or 2 digits.
 * Integer payloads from older clients are accepted and stored as their decimal
 * string ("12", not "012"); "00" must be sent as a string.
 */
export const jerseyNumberSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 99) {
    return String(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  return value;
}, z.string().regex(/^\d{1,2}$/, "jerseyNumber must be 1 or 2 digits").optional());