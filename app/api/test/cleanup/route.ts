import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  // Only allow in test environment
  if (process.env.NODE_ENV !== 'test') {
    return new NextResponse("Not allowed", { status: 403 });
  }

  try {
    // Clean up test data
    await db.purchase.deleteMany({
      where: {
        userId: {
          startsWith: 'test-'
        }
      }
    });

    await db.chapaTransaction.deleteMany({
      where: {
        userId: {
          startsWith: 'test-'
        }
      }
    });

    await db.course.deleteMany({
      where: {
        userId: {
          startsWith: 'test-'
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[TEST_CLEANUP_ERROR]", error);
    return new NextResponse(error.message, { status: 500 });
  }
} 