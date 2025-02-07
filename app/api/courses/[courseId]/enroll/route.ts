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
    const tx_ref = searchParams.get("tx_ref");
    const status = searchParams.get("status");

    console.log("[CHAPA_CALLBACK] Status:", status, "TX_REF:", tx_ref);

    if (!tx_ref || !status) {
      console.log("[CHAPA_CALLBACK_ERROR] Missing parameters:", { tx_ref, status });
      return new NextResponse("Missing transaction reference or status", { status: 400 });
    }

    // First find the transaction
    const chapaTransaction = await db.chapaTransaction.findFirst({
      where: {
        tx_ref: tx_ref,
      }
    });

    if (!chapaTransaction) {
      console.log("[CHAPA_CALLBACK_ERROR] Transaction not found:", tx_ref);
      return new NextResponse("Transaction not found", { status: 404 });
    }

    try {
      // Verify payment with Chapa
      const verifyResponse = await axios({
        method: "get",
        url: `https://api.chapa.co/v1/transaction/verify/${tx_ref}`,
        headers: {
          "Authorization": `Bearer ${process.env.CHAPA_SECRET_KEY}`
        }
      });

      console.log("[CHAPA_VERIFY_RESPONSE]", JSON.stringify(verifyResponse.data, null, 2));

      // Check if the verification was successful
      const isSuccessful = verifyResponse.data?.data?.status === "success" || 
                          status === "success"; // Fallback to callback status

      if (isSuccessful) {
        // Update transaction status
        await db.chapaTransaction.update({
          where: {
            tx_ref: tx_ref
          },
          data: {
            status: TransactionStatus.SUCCESSFUL
          }
        });

        // Create purchase record if it doesn't exist
        const existingPurchase = await db.purchase.findUnique({
          where: {
            userId_courseId: {
              userId: chapaTransaction.userId,
              courseId: chapaTransaction.courseId
            }
          }
        });

        if (!existingPurchase) {
          await db.purchase.create({
            data: {
              courseId: chapaTransaction.courseId,
              userId: chapaTransaction.userId,
              tx_ref: tx_ref
            }
          });
        }

        // Get the first chapter to redirect to
        const course = await db.course.findUnique({
          where: {
            id: chapaTransaction.courseId
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

        if (!course?.chapters[0]) {
          console.log("[CHAPA_CALLBACK_ERROR] No chapters found for course:", chapaTransaction.courseId);
          return new NextResponse("No chapters found", { status: 404 });
        }

        const redirectUrl = new URL(
          `/courses/${course.id}/chapters/${course.chapters[0].id}`, 
          process.env.NEXT_PUBLIC_APP_URL
        );
        console.log("[CHAPA_CALLBACK_SUCCESS] Redirecting to:", redirectUrl.toString());
        return NextResponse.redirect(redirectUrl);
      } else {
        // Update transaction status to failed
        await db.chapaTransaction.update({
          where: {
            tx_ref: tx_ref
          },
          data: {
            status: TransactionStatus.FAILED
          }
        });

        const redirectUrl = new URL(
          `/courses/${chapaTransaction.courseId}?error=payment_failed`, 
          process.env.NEXT_PUBLIC_APP_URL
        );
        console.log("[CHAPA_CALLBACK_FAILED] Redirecting to:", redirectUrl.toString());
        return NextResponse.redirect(redirectUrl);
      }
    } catch (error: any) {
      console.error("[CHAPA_VERIFY_ERROR]", {
        message: error.message,
        response: error.response?.data
      });
      
      // If verification fails, we'll rely on the callback status
      if (status === "success") {
        // Proceed with successful payment flow
        await db.chapaTransaction.update({
          where: { tx_ref: tx_ref },
          data: { status: TransactionStatus.SUCCESSFUL }
        });

        await db.purchase.create({
          data: {
            courseId: chapaTransaction.courseId,
            userId: chapaTransaction.userId,
            tx_ref: tx_ref
          }
        });

        const course = await db.course.findUnique({
          where: { id: chapaTransaction.courseId },
          include: {
            chapters: {
              where: { isPublished: true },
              orderBy: { position: 'asc' },
              take: 1
            }
          }
        });

        if (!course?.chapters[0]) {
          return new NextResponse("No chapters found", { status: 404 });
        }

        return NextResponse.redirect(
          new URL(`/courses/${course.id}/chapters/${course.chapters[0].id}`, 
          process.env.NEXT_PUBLIC_APP_URL)
        );
      } else {
        await db.chapaTransaction.update({
          where: { tx_ref: tx_ref },
          data: { status: TransactionStatus.FAILED }
        });

        return NextResponse.redirect(
          new URL(`/courses/${chapaTransaction.courseId}?error=payment_failed`, 
          process.env.NEXT_PUBLIC_APP_URL)
        );
      }
    }
  } catch (error: any) {
    console.error("[CHAPA_CALLBACK_ERROR]", {
      message: error.message,
      stack: error.stack
    });
    return new NextResponse("Internal Error", { status: 500 });
  }
}
