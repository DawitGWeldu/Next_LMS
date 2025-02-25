import { currentUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: { courseId: string } }
) {
  try {
    const user = await currentUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const purchase = await db.purchase.findUnique({
      where: {
        userId_courseId: {
          userId: user.id!,
          courseId: params.courseId
        }
      }
    });

    if (!purchase) {
      return new NextResponse("Purchase not found", { status: 404 });
    }

    return NextResponse.json(purchase);
  } catch (error: any) {
    console.error("[GET_PURCHASE_ERROR]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 