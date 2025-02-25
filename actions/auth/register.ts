"use server";

import * as z from "zod";
import bcrypt from "bcryptjs";

import { db } from "@/lib/db";
import { RegisterSchema } from "@/schemas";
import { getUserByPhoneNumber } from "@/data/user";
import { sendVerificationSms } from "@/lib/sms";
import parsePhoneNumber from "libphonenumber-js";

export const register = async (values: z.infer<typeof RegisterSchema>) => {
  const validatedFields = RegisterSchema.safeParse(values);

  if (!validatedFields.success) {
    return { error: "Invalid fields!" };
  }

  const { phoneNumber, password, name } = validatedFields.data;
  
  const hashedPassword = await bcrypt.hash(password, 10);

  const existingUser = await getUserByPhoneNumber(phoneNumber);

  if (existingUser) {
    return { error: "Phone number already in use!" };
  }
  let nationalNumber = parsePhoneNumber(phoneNumber)!.nationalNumber; 
  const num = nationalNumber;
  await db.user.create({
    data: {
      name,
      phoneNumber: num,
      password: hashedPassword,
    },
  });

  // Skip SMS verification in test mode
  if (process.env.NODE_ENV === 'test') {
    return { success: "Registration successful" };
  }

  try {
    const code = await sendVerificationSms(`0${num}`);
    await saveVerificationCode(code, num);
    return { success: "Sending confirmation code via SMS" };
  } catch (error) {
    console.error("[VERIFICATION_ERROR]", error);
    return { error: "Failed to send verification code" };
  }
};

const saveVerificationCode = async (code: string, phoneNumber: string) => {
  await db.verificationToken.create({
    data: {
      phoneNumber,
      token: code,
      expires: new Date(Date.now() + 1000 * 60 * 60 * 1),
    },
  });
}