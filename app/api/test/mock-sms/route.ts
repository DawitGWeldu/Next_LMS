import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import parsePhoneNumber from "libphonenumber-js";

const TEST_CODE = '012345';

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

    // Parse phone number to get national number
    const parsedNumber = parsePhoneNumber(phoneNumber);
    if (!parsedNumber) {
      return new NextResponse("Invalid phone number", { status: 400 });
    }
    const nationalNumber = parsedNumber.nationalNumber;

    // Delete any existing verification tokens for this phone number
    await db.verificationToken.deleteMany({
      where: { phoneNumber: nationalNumber }
    });

    // Create verification token with fixed code
    await db.verificationToken.create({
      data: {
        phoneNumber: nationalNumber,
        token: TEST_CODE,
        expires: new Date(Date.now() + 1000 * 60 * 60 * 1), // 1 hour expiry
      }
    });

    return NextResponse.json({ code: TEST_CODE });
  } catch (error) {
    console.error("[MOCK_SMS_ERROR]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 

// This is a dummy export to satisfy Next.js build process
// See: https://github.com/vercel/next.js/discussions/48724
export const dynamic = "force-dynamic";
