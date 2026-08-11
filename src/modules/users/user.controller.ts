import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { ApiError } from "../../utils/ApiError";
import { idParamsSchema } from "../../utils/validation";
import { UserModel, type UserDocument } from "./user.model";
import { createUserSchema, updateUserSchema } from "./user.validation";

const serializeUser = (user: UserDocument & { _id: unknown }) => ({
  id: user._id,
  email: user.email,
  role: user.role
});

export const createUser = async (req: Request, res: Response): Promise<void> => {
  const body = createUserSchema.parse(req.body);
  const existing = await UserModel.exists({ email: body.email });
  if (existing) {
    throw new ApiError(409, "Email already in use");
  }

  const user = await UserModel.create({
    email: body.email,
    passwordHash: await bcrypt.hash(body.password, 10),
    role: body.role
  });

  res.status(201).json({ message: "User created", user: serializeUser(user) });
};

export const listUsers = async (_req: Request, res: Response): Promise<void> => {
  const users = await UserModel.find().sort({ email: 1 });
  res.status(200).json({ users: users.map(serializeUser) });
};

export const getUser = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const user = await UserModel.findById(id);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  res.status(200).json({ user: serializeUser(user) });
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  const body = updateUserSchema.parse(req.body);
  const user = await UserModel.findById(id);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (body.email && body.email !== user.email) {
    const existing = await UserModel.exists({ email: body.email, _id: { $ne: id } });
    if (existing) {
      throw new ApiError(409, "Email already in use");
    }
    user.email = body.email;
  }

  if (body.password) {
    user.passwordHash = await bcrypt.hash(body.password, 10);
  }
  if (body.role) {
    user.role = body.role;
  }
  await user.save();

  res.status(200).json({ message: "User updated", user: serializeUser(user) });
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamsSchema.parse(req.params);
  if (req.user?.userId === id) {
    throw new ApiError(409, "You cannot delete your own user");
  }

  const user = await UserModel.findByIdAndDelete(id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  res.status(200).json({ message: "User deleted" });
};