import bcrypt from "bcrypt";
export default async function HashPassword(password: string) {
  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds); // Hashing the password directly with salt rounds
  return hash;
}
