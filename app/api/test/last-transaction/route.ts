import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const COURSE_ID = '945a7e40-4ed5-4959-b063-1726ae511d3c';

export async function GET(req: Request) {
  // Only allow in test environment
  if (process.env.NODE_ENV !== 'test') {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  try {
    // First check all pending transactions
    const allPending = await db.chapaTransaction.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' }
    });
    console.log("[TEST_GET_TRANSACTION] All pending transactions:", allPending);

    // Get the most recent transaction for our test course
    const transaction = await db.chapaTransaction.findFirst({
      where: {
        courseId: COURSE_ID,
        status: 'PENDING'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!transaction) {
      console.log("[TEST_GET_TRANSACTION] No transaction found for course:", COURSE_ID);
      return NextResponse.json({ error: "No transaction found" }, { status: 404 });
    }

    console.log("[TEST_GET_TRANSACTION] Found transaction:", transaction);
    return NextResponse.json(transaction);
  } catch (error: any) {
    console.error("[TEST_GET_TRANSACTION_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 