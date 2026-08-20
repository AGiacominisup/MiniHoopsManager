import { createHmac, randomInt } from "node:crypto";
import { env } from "../../config/env";

// No I, L, O, U, 0 or 1: the code is read off a screen and typed on a tablet at
// courtside, so ambiguous glyphs cost more than the lost entropy.
const COURT_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const COURT_CODE_LENGTH = 8;

// 30^8 is roughly 39 bits. Brute force is bounded by the persistent attempt
// lockout in courtAccess.service, not by the length alone.
export const generateCourtCode = (): string => {
  let code = "";
  for (let index = 0; index < COURT_CODE_LENGTH; index += 1) {
    code += COURT_CODE_ALPHABET[randomInt(COURT_CODE_ALPHABET.length)];
  }
  return code;
};

export const normalizeCourtCode = (code: string): string =>
  code.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const formatCourtCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`;

// A keyed hash, not bcrypt: the exchange endpoint looks a code up *by its
// value*, and a per-record salt cannot be indexed. bcrypt would force a scan of
// every active code running a deliberately slow hash on each, on a public
// endpoint. Keying with JWT_SECRET keeps the code unrecoverable without adding
// a config key.
export const hashCourtCode = (code: string): string =>
  createHmac("sha256", env.JWT_SECRET).update(normalizeCourtCode(code)).digest("hex");
