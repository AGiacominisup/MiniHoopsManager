import { Schema, model } from "mongoose";

export type UserRole = "admin" | "coach" | "staff" | "referee";

export interface UserDocument {
  email: string;
  name?: string;
  passwordHash: string;
  role: UserRole;
}

const userSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    name: {
      type: String,
      trim: true,
      unique: true,
      sparse: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ["admin", "coach", "staff", "referee"],
      default: "staff",
      required: true
    }
  },
  {
    timestamps: true
  }
);

export const UserModel = model<UserDocument>("User", userSchema);
