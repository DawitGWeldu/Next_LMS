"use server";

import * as z from "zod";
import bcrypt from "bcryptjs";

// import { unstable_update } from "@/auth";
import { db } from "@/lib/db";
import { SettingsSchema } from "@/schemas";
import { getUserByPhoneNumber, getUserById } from "@/data/user";
import { currentUser } from "@/lib/auth";
// import { generateVerificationToken } from "@/lib/tokens";
import { sendVerificationSms } from "@/lib/sms";

export const settings = async (
  values: z.infer<typeof SettingsSchema>
) => {
  const user = await currentUser();

  if (!user) {
    return { error: "Unauthorized" }
  }
  const userId = user.id;
  const dbUser = await getUserById(userId!);

  if (!dbUser) {
    return { error: "Unauthorized" }
  }

  // if (user.isOAuth) {
  //   values.email = undefined;
  //   values.password = undefined;
  //   values.newPassword = undefined;
  //   values.isTwoFactorEnabled = undefined;
  // }

  if (values.phoneNumber && values.phoneNumber !== user.phoneNumber) {
    const existingUser = await getUserByPhoneNumber(values.phoneNumber);

    if (existingUser && existingUser.id !== user.id) {
      return { error: "Email already in use!" }
    }
    //don't forget await 
    sendVerificationSms(
      existingUser!.phoneNumber,
    );

    return { success: "Verification message sent!" };
  }

  if (values.password && values.newPassword && dbUser.password) {
    const passwordsMatch = await bcrypt.compare(
      values.password,
      dbUser.password,
    );

    if (!passwordsMatch) {
      return { error: "Incorrect password!" };
    }

    const hashedPassword = await bcrypt.hash(
      values.newPassword,
      10,
    );
    values.password = hashedPassword;
    values.newPassword = undefined;
  }

  const updatedUser = await db.user.update({
    where: { id: dbUser.id },
    data: {
      ...values,
    }
  });

  // unstable_update({
  //   user: {
  //     name: updatedUser.name,
  //     phoneNumber: updatedUser.phoneNumber,
  //     isTwoFactorEnabled: updatedUser.isTwoFactorEnabled,
  //     role: updatedUser.role,
  //   }
  // });

  return { success: "Settings Updated!" }
}