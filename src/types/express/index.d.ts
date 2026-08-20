import type { UserRole } from "../../modules/users/user.model";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: UserRole;
      };
      // A separate property, never a union on `user` and never an optional
      // `role`: a referee session has no user and no role, so requireRole
      // behind requireRefereeSession fails closed with 401.
      refereeSession?: {
        sessionId: string;
        tournamentId: string;
        courtId: string;
      };
    }
  }
}

export {};
