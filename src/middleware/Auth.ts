import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/AppError";

const JWT_SECRET = process.env.JWT_SECRET as string;

export function AuthUser(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = req.cookies.token;

  if (!token) {
    res.status(401).json({
      msg: "No authentication token provided",
    });
    return;
  }

  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is not set");
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET) as AuthUserType;

    (req as any).user = verified;

    next();
  } catch (error) {
      // JWT errors are EXPECTED — handle them here, don't bubble up
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ msg: "Token expired, please login again" });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      // covers: malformed, invalid signature, wrong algorithm, etc.
      res.status(401).json({ msg: "Invalid token" });
      return;
    }

    next(error);
  }
}

/**
 * Role guard. Must run AFTER `AuthUser`, which populates `req.user`.
 * Usage: router.post("/create", AuthUser, requireRole("Admin"), handler)
 */
export function requireRole(...roles: AuthUserType["role"][]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      // Defensive: AuthUser should have populated req.user already.
      next(new AppError("Authentication required", 401));
      return;
    }

    if (!roles.includes(user.role)) {
      next(
        new AppError("You do not have permission to perform this action", 403)
      );
      return;
    }

    next();
  };
}
