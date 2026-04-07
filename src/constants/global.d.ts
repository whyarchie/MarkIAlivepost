export {};

declare global {

  interface AuthUserType {
    id: number;
    role: "Patient" | "Doctor" | "Hospital" | "Admin";
  }

  namespace Express {
    interface Request {
      user?: AuthUserType;
    }
  }

}