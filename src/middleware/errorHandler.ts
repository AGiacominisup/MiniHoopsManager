import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError";

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      message: "Validation error",
      errors: err.flatten().fieldErrors
    });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ message: "Database validation error", errors: err.errors });
    return;
  }

  if (typeof err === "object" && err !== null && "code" in err && err.code === 11000) {
    res.status(409).json({ message: "A resource with the same unique fields already exists" });
    return;
  }

  // Never reflect an unexpected error message to the caller: it can carry a
  // connection string or a stack detail, and some endpoints are public.
  if (err instanceof Error) {
    console.error("Unhandled error", { name: err.name, message: err.message, stack: err.stack });
    res.status(500).json({ message: "Internal server error" });
    return;
  }

  console.error("Unhandled non-error rejection", { err });
  res.status(500).json({ message: "Unknown server error" });
};
