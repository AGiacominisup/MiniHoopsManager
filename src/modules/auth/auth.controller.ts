import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { jwtConfig } from "../../config/jwt";
import { ApiError } from "../../utils/ApiError";
import { UserModel } from "../users/user.model";
import { loginSchema } from "./auth.validation";

const signToken = (userId: string, role: string): string => {
  return jwt.sign({ userId, role }, jwtConfig.secret, {
    algorithm: jwtConfig.algorithm,
    expiresIn: jwtConfig.expiresIn
  });
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
      id: String(user._id),
      email: user.email,
      role: user.role
    }
  });
};
