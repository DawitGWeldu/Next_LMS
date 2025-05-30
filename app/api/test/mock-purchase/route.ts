import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { courseId } = await req.json();
    if (!courseId) {
      return NextResponse.json({ error: "Course ID is required" }, { status: 400 });
    }

    // Create purchase record
    const purchase = await db.purchase.create({
      data: {
        userId: user.id,
        courseId: courseId
      }
    });

    return NextResponse.json(purchase);
  } catch (error: any) {
    console.error("[MOCK_PURCHASE_ERROR]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 

// This is a dummy export to satisfy Next.js build process
// See: https://github.com/vercel/next.js/discussions/48724
export const dynamic = "force-dynamic";
