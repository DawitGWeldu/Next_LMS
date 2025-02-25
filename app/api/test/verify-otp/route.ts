import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  // Only allow in test environment
  if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
    return new NextResponse("Not allowed", { status: 403 });
  }

  try {
    const { phoneNumber } = await req.json();

    if (!phoneNumber) {
      return new NextResponse("Phone number is required", { status: 400 });
    }

    // Get the verification token
    const verificationToken = await db.verificationToken.findFirst({
      where: { phoneNumber }
    });

    if (!verificationToken) {
      return new NextResponse("No verification token found", { status: 404 });
    }

    // Get the user
    const user = await db.user.findFirst({
      where: { phoneNumber }
    });

    if (!user) {
      return new NextResponse("User not found", { status: 404 });
    }

    // Mark phone as verified
    await db.user.update({
      where: { id: user.id },
      data: { 
        phoneNumberVerified: new Date(),
        phoneNumber: verificationToken.phoneNumber,
      }
    });

    // Delete the verification token
    await db.verificationToken.delete({
      where: { id: verificationToken.id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[TEST_VERIFY_OTP]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 