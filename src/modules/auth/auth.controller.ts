import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { UserModel } from "../users/user.model";
import { loginSchema } from "./auth.validation";

const signToken = (userId: string, role: string): string => {
  const secret: Secret = env.JWT_SECRET;
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"]
  };

  return jwt.sign({ userId, role }, secret, options);
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const body = loginSchema.parse(req.body);

  const user = await UserModel.findOne({ email: body.email.toLowerCase() });
  if (!user) {
    throw new ApiError(401, "Invalid credentials");
  }

  const validPassword = await bcrypt.compare(body.password, user.passwordHash);
  if (!validPassword) {
    throw new ApiError(401, "Invalid credentials");
  }

  const token = signToken(String(user._id), user.role);

  res.status(200).json({
    message: "Login successful",
    token,
    user: {
      id: user._id,
      email: user.email,
      role: user.role
    }
  });
};
