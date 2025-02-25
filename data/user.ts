import { db } from "@/lib/db";

export const getUserByPhoneNumber = async (phoneNumber: string) => {
  try {
    const user = await db.user.findUnique({ where: { phoneNumber } });
    
    if (!user) return null;

    return {
      id: user.id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      phoneNumberVerified: user.phoneNumberVerified,
      password: user.password,
      role: user.role,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
    };
  } catch (error) {
    console.error("[GET_USER_BY_PHONE]", error);
    return null;
  }
};

export const getUserById = async (id: string) => {
  try {
    const user = await db.user.findUnique({ where: { id } });

    return user;
  } catch {
    return null;
  }
};
