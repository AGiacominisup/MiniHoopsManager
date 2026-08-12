import type { Algorithm, SignOptions } from "jsonwebtoken";
import { env } from "./env";

export const jwtConfig = {
  algorithm: "HS256" as Algorithm,
  expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  secret: env.JWT_SECRET
};