import mongoose from "mongoose";
import { env } from "./env";

export const connectToDatabase = async (): Promise<void> => {
  await mongoose.connect(env.MONGODB_URI);
};
