import { InitializeOptions } from "chapa-nodejs"
import { currentUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from 'uuid';
import axios from "axios"
import { db } from "@/lib/db";
import { Course, TransactionStatus } from "@prisma/client";

export async function GET(
  req: Request,
  { params }: { params: { courseId: string } }
) {
  try {
    const url = new URL(req.url);
    const searchParams = url.searchParams;
    
    // Log all parameters for debugging
    console.log("[ENROLL_PARAMS]", {
      allParams: Object.fromEntries(searchParams.entries()),
      url: url.toString()
    });

    // Only expect tx_ref from Chapa callback
    const tx_ref = searchParams.get("tx_ref") || searchParams.get("trx_ref");
    if (!tx_ref) {
      console.log("[CALLBACK_ERROR] Missing transaction reference");
      return new NextResponse("Missing transaction reference", { status: 400 });
    }

    // Find the transaction
    const transaction = await db.chapaTransaction.findUnique({
      where: { tx_ref }
    });

    if (!transaction) {
      console.log("[CALLBACK_ERROR] Transaction not found:", tx_ref);
      return new NextResponse("Transaction not found", { status: 404 });
    }

    // Get the course for redirection
    const course = await db.course.findUnique({
      where: {
        id: transaction.courseId
      },
      include: {
        chapters: {
          where: {
            isPublished: true
          },
          orderBy: {
            position: 'asc'
          },
          take: 1
        }
      }
    });

    if (!course) {
      console.log("[CALLBACK_ERROR] Course not found:", transaction.courseId);
      return new NextResponse("Course not found", { status: 404 });
    }

    // Check transaction status and redirect accordingly
    if (transaction.status === TransactionStatus.SUCCESSFUL) {
      // If payment was successful, redirect to first chapter
      if (!course.chapters[0]) {
        console.log("[CALLBACK_ERROR] No chapters found for course:", course.id);
        return new NextResponse("No chapters found", { status: 404 });
      }

      const redirectUrl = new URL(
        `/courses/${course.id}/chapters/${course.chapters[0].id}`,
        process.env.NEXT_PUBLIC_APP_URL
      );
      console.log("[CALLBACK_SUCCESS] Redirecting to:", redirectUrl.toString());
      return NextResponse.redirect(redirectUrl);
    } else {
      // If payment failed or pending, redirect back to course page with error
      const redirectUrl = new URL(
        `/courses/${course.id}?error=payment_${transaction.status.toLowerCase()}`,
        process.env.NEXT_PUBLIC_APP_URL
      );
      console.log("[CALLBACK_FAILED] Redirecting to:", redirectUrl.toString());
      return NextResponse.redirect(redirectUrl);
    }
  } catch (error: any) {
    console.error("[CALLBACK_ERROR]", {
      message: error.message,
      stack: error.stack
    });
    return new NextResponse("Internal Error", { status: 500 });
  }
}


// This is a dummy export to satisfy Next.js build process
// See: https://github.com/vercel/next.js/discussions/48724
export const dynamic = "force-dynamic";
