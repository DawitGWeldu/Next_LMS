import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { TransactionStatus } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const headersList = headers();
    const signature = headersList.get("Chapa-Signature");
    
    console.log("[WEBHOOK_HEADERS]", {
      signature,
      contentType: headersList.get("content-type")
    });

    // Parse the webhook body
    const webhookData = JSON.parse(body);
    console.log("[WEBHOOK_BODY]", webhookData);

    const tx_ref = webhookData?.tx_ref;
    const status = webhookData?.status?.toLowerCase();

    if (!tx_ref) {
      console.log("[WEBHOOK_ERROR] No transaction reference found in:", webhookData);
      return new NextResponse("No transaction reference found", { status: 400 });
    }

    console.log("[WEBHOOK_RECEIVED]", {
      tx_ref,
      status,
      type: webhookData?.type
    });

    // Find and update the transaction
    const transaction = await db.chapaTransaction.findUnique({
      where: { tx_ref }
    });

    if (!transaction) {
      console.log("[WEBHOOK_ERROR] Transaction not found:", tx_ref);
      return new NextResponse("Transaction not found", { status: 404 });
    }

    console.log("[WEBHOOK_TRANSACTION]", transaction);

    // Update transaction status
    if (status === "success") {
      await db.chapaTransaction.update({
        where: { tx_ref },
        data: { status: TransactionStatus.SUCCESSFUL }
      });

      // Create purchase record if it doesn't exist
      const existingPurchase = await db.purchase.findUnique({
        where: {
          userId_courseId: {
            userId: transaction.userId,
            courseId: transaction.courseId
          }
        }
      });

      if (!existingPurchase) {
        const purchase = await db.purchase.create({
          data: {
            courseId: transaction.courseId,
            userId: transaction.userId,
            tx_ref
          }
        });
        console.log("[WEBHOOK_PURCHASE_CREATED]", purchase);
      } else {
        console.log("[WEBHOOK_PURCHASE_EXISTS]", existingPurchase);
      }
    } else {
      await db.chapaTransaction.update({
        where: { tx_ref },
        data: { status: TransactionStatus.FAILED }
      });
      console.log("[WEBHOOK_TRANSACTION_FAILED]", { tx_ref, status });
    }

    return new NextResponse(null, { status: 200 });
  } catch (error: any) {
    console.error("[WEBHOOK_ERROR]", {
      message: error.message,
      stack: error.stack
    });
    return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 });
  }
}