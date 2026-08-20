import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { errorHandler } from "./errorHandler";

interface CapturedResponse {
  statusCode?: number;
  body?: { message?: string };
}

const captureResponse = (): { res: Response; captured: CapturedResponse } => {
  const captured: CapturedResponse = {};
  const res = {
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body as { message?: string };
      return this;
    }
  } as unknown as Response;

  return { res, captured };
};

const handle = (error: unknown): CapturedResponse => {
  const { res, captured } = captureResponse();
  errorHandler(error, {} as Request, res, (() => undefined) as NextFunction);
  return captured;
};

test("keeps reporting ApiError messages, which are written for the client", () => {
  const captured = handle(new ApiError(409, "Court already has an assigned match"));

  assert.equal(captured.statusCode, 409);
  assert.equal(captured.body?.message, "Court already has an assigned match");
});

// An unexpected error message can carry a connection string, and the code
// exchange endpoint is public.
test("does not reflect an unexpected error message to the caller", () => {
  const secret = "mongodb+srv://user:pa55word@cluster.example.net/db";
  const captured = handle(new Error(secret));

  assert.equal(captured.statusCode, 500);
  assert.equal(captured.body?.message, "Internal server error");
  assert.ok(!JSON.stringify(captured.body).includes("pa55word"));
  assert.ok(!JSON.stringify(captured.body).includes("mongodb"));
});

test("answers a non-error rejection without leaking its shape", () => {
  const captured = handle({ secret: "pa55word" });

  assert.equal(captured.statusCode, 500);
  assert.equal(captured.body?.message, "Unknown server error");
  assert.ok(!JSON.stringify(captured.body).includes("pa55word"));
});
