import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

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