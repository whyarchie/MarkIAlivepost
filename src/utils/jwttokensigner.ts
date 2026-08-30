import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";

export default function jwtTokenSigner(
  user: { id: number; role: string },
  expiresIn: SignOptions["expiresIn"] = "30d",
){

   const token =  jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET!,
        {
            expiresIn,
        },
    );
    return token
}
