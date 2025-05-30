import bcrypt from "bcryptjs";
import Credentials from "next-auth/providers/credentials";
import { LoginSchema } from "@/schemas";
import { getUserByPhoneNumber } from "@/data/user";

export const credentialsProvider = Credentials({
  async authorize(credentials) {
    const validatedFields = LoginSchema.safeParse(credentials);

    if (validatedFields.success) {
      const { phoneNumber, password } = validatedFields.data;
      const user = await getUserByPhoneNumber(phoneNumber);
      if (!user || !user.password) return null;
      
      const passwordsMatch = await bcrypt.compare(
        password,
        user.password,
      );
      if (passwordsMatch) return user;
    }

    return null;
  }
}); 