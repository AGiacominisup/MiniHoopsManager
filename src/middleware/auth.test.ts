import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { app } from "../app";
import { jwtConfig } from "../config/jwt";
import { ApiError } from "../utils/ApiError";
import { requireAuth, requireBackofficeUser, requireRole } from "./auth";

const requestWithAuthorization = (authorization?: string): Request => ({
  method: "GET",
  originalUrl: "/api/tournaments",
  headers: authorization ? { authorization } : {}
}) as Request;

const invokeRequireAuth = (request: Request): { nextCalled: boolean; error?: unknown } => {
  let nextCalled = false;

  try {
    requireAuth(request, {} as Response, (() => {
      nextCalled = true;
    }) as NextFunction);
    return { nextCalled };
  } catch (error: unknown) {
    return { nextCalled, error };
  }
};

test("accepts a valid Bearer token signed with the configured secret", () => {
  const token = jwt.sign({ userId: "user-1", role: "admin" }, jwtConfig.secret, {
    algorithm: jwtConfig.algorithm,
    expiresIn: "5m"
  });
  const request = requestWithAuthorization(`Bearer ${token}`);

  const result = invokeRequireAuth(request);

  assert.equal(result.error, undefined);
  assert.equal(result.nextCalled, true);
  assert.deepEqual(request.user, { userId: "user-1", role: "admin" });
});

test("returns 401 for missing, malformed, expired, and invalid tokens", () => {
  const expiredToken = jwt.sign({ userId: "user-1", role: "admin" }, jwtConfig.secret, {
    algorithm: jwtConfig.algorithm,
    expiresIn: -1
  });
  const invalidToken = jwt.sign(
    { userId: "user-1", role: "admin" },
    "a-different-secret-with-enough-length"
  );
  const cases = [
    requestWithAuthorization(),
    requestWithAuthorization("Basic credentials"),
    requestWithAuthorization(`Bearer ${expiredToken}`),
    requestWithAuthorization(`Bearer ${invalidToken}`)
  ];

  for (const request of cases) {
    const { error, nextCalled } = invokeRequireAuth(request);
    assert.equal(nextCalled, false);
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 401);
  }
});

// A referee token is signed with the same secret, so nothing but this check
// stops a court tablet from reading every tournament, player and registration
// through the routes that carry requireAuth without requireRole.
test("rejects a referee session token on user routes", () => {
  const refereeToken = jwt.sign(
    {
      kind: "referee",
      sessionId: "session-1",
      tournamentId: "66b000000000000000000001",
      courtId: "66b000000000000000000010",
      tokenVersion: 1
    },
    jwtConfig.secret,
    { algorithm: jwtConfig.algorithm, expiresIn: "5m" }
  );
  const request = requestWithAuthorization(`Bearer ${refereeToken}`);

  const { error, nextCalled } = invokeRequireAuth(request);

  assert.equal(nextCalled, false);
  assert.ok(error instanceof ApiError);
  assert.equal(error.statusCode, 401);
  assert.equal(request.user, undefined);
});

test("requireRole rejects a request that only carries a referee session", () => {
  const request = {
    refereeSession: {
      sessionId: "session-1",
      tournamentId: "66b000000000000000000001",
      courtId: "66b000000000000000000010"
    }
  } as Request;
  let nextCalled = false;

  assert.throws(
    () => {
      requireRole(["admin", "staff"])(request, {} as Response, (() => {
        nextCalled = true;
      }) as NextFunction);
    },
    (error: unknown) => error instanceof ApiError && error.statusCode === 401
  );
  assert.equal(nextCalled, false);
});

test("backoffice authentication rejects referee users", () => {
  const request = {
    user: { userId: "referee-1", role: "referee" }
  } as Request;
  let nextCalled = false;

  assert.throws(
    () => {
      requireBackofficeUser(request, {} as Response, (() => {
        nextCalled = true;
      }) as NextFunction);
    },
    (error: unknown) => error instanceof ApiError && error.statusCode === 403
  );
  assert.equal(nextCalled, false);
});

test("handles CORS preflight before protected route authentication", async (context) => {
  const server = app.listen(0);
  context.after(() => server.close());
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  const response = await fetch(`http://127.0.0.1:${port}/api/tournaments`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://example.com",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "Authorization, Content-Type"
    }
  });

  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("access-control-allow-headers"),
    "Authorization,Content-Type"
  );
});