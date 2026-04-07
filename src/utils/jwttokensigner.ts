import jwt from "jsonwebtoken";

export default function jwtTokenSigner(user:{id:number, role: string}){

   const token =  jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET!,
        {
            expiresIn: "30d",
        },
    );
    return token
}