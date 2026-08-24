import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { jwtConfig } from "../../config/jwt";
import { ApiError } from "../../utils/ApiError";
import { UserModel, type UserDocument } from "../users/user.model";
import { loginSchema, refereeRegistrationSchema } from "./auth.validation";

const signToken = (userId: string, role: string): string => {
  return jwt.sign({ userId, role }, jwtConfig.secret, {
    algorithm: jwtConfig.algorithm,
    expiresIn: jwtConfig.expiresIn
  });
};

const serializeAuthUser = (user: UserDocument & { _id: unknown }) => ({
  id: String(user._id),
  email: user.email,
  name: user.name ?? null,
  role: user.role
});

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
    user: serializeAuthUser(user)
  });
};

export const loginReferee = async (req: Request, res: Response): Promise<void> => {
  const body = loginSchema.parse(req.body);
  const user = await UserModel.findOne({ email: body.email.toLowerCase(), role: "referee" });

  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw new ApiError(401, "Invalid credentials");
  }

  const token = signToken(String(user._id), user.role);

  res.status(200).json({
    message: "Login successful",
    token,
    user: serializeAuthUser(user)
  });
};

export const registerReferee = async (req: Request, res: Response): Promise<void> => {
  const body = refereeRegistrationSchema.parse(req.body);
  const existingEmail = await UserModel.exists({ email: body.email.toLowerCase() });
  if (existingEmail) {
    throw new ApiError(409, "Email already in use");
  }

  const existingName = await UserModel.exists({ name: body.name });
  if (existingName) {
    throw new ApiError(409, "Name already in use");
  }

  const user = await UserModel.create({
    email: body.email,
    name: body.name,
    passwordHash: await bcrypt.hash(body.password, 10),
    role: "referee"
  });

  res.status(201).json({
    message: "Referee account created",
    user: serializeAuthUser(user)
  });
};
