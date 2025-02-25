import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  // Only allow in test environment
  if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
    return new NextResponse("Not allowed", { status: 403 });
  }

  try {
    console.log("[TEST_CLEANUP] Starting cleanup...");

    // Clean up verification tokens
    await db.verificationToken.deleteMany({
      where: {
        phoneNumber: {
          startsWith: '9'  // Test numbers start with 9
        }
      }
    });

    // Clean up test users
    await db.user.deleteMany({
      where: {
        phoneNumber: {
          startsWith: '9'  // Test numbers start with 9
        }
      }
    });

    console.log("[TEST_CLEANUP] Cleanup completed successfully");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[TEST_CLEANUP_ERROR]", error);
    return new NextResponse(error.message, { status: 500 });
  }
} 