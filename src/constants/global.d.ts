export {};

declare global {

  interface AuthUserType {
    id: number;
    role: "Patient" | "Doctor" | "Hospital" | "Admin";
  }

  namespace Express {
    interface Request {
      user?: AuthUserType;
      // Raw request body bytes, captured by express.json's verify hook so
      // webhooks (e.g. Razorpay) can verify signatures over the exact payload.
      rawBody?: Buffer;
    }
  }

}