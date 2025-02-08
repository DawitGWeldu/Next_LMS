import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { TransactionStatus } from "@prisma/client";
import crypto from 'crypto';

// Verify Chapa webhook signature using the secret hash
function verifySignature(payload: string, signature: string | null) {
  if (!signature) {
    console.log("[SIGNATURE_VERIFY_ERROR] No signature provided");
    return false;
  }
  
  try {
    // Use the secret hash from environment variables
    const secret = process.env.NEXT_PUBLIC_CHAPA_ECRYPTION_KEY;
    if (!secret) {
      console.log("[SIGNATURE_VERIFY_ERROR] No secret key configured");
      return false;
    }

    // Calculate HMAC SHA256 hash as per Chapa docs
    const hash = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    console.log("[SIGNATURE_VERIFY]", {
      receivedSignature: signature,
      calculatedHash: hash,
      payload: payload
    });

    return hash === signature;
  } catch (error) {
    console.error("[SIGNATURE_VERIFY_ERROR]", error);
    return false;
  }
}

// Handle POST requests (Chapa sends webhooks as POST)
export async function POST(req: Request) {
  try {
    const headersList = headers();
    const signature = headersList.get("Chapa-Signature") || headersList.get("x-chapa-signature");
    const body = await req.text();
    
    // Log complete request data
    console.log("[WEBHOOK_POST_FULL_DATA]", {
      method: "POST",
      headers: {
        signature,
        contentType: headersList.get("content-type"),
        userAgent: headersList.get("user-agent"),
        host: headersList.get("host"),
        all: Object.fromEntries(headersList.entries())
      },
      rawBody: body
    });

    // Verify webhook signature
    if (!verifySignature(body, signature)) {
      console.log("[WEBHOOK_POST_ERROR] Invalid signature", {
        receivedSignature: signature,
        payload: body
      });
      return new NextResponse("Invalid signature", { status: 401 });
    }

    // Parse the webhook body
    const webhookData = JSON.parse(body);
    console.log("[WEBHOOK_POST_BODY]", webhookData);

    // Check if this is a successful charge event
    if (webhookData.event !== "charge.success") {
      console.log("[WEBHOOK_POST_INFO] Ignoring non-success event:", webhookData.event);
      return new NextResponse(null, { status: 200 }); // Acknowledge receipt
    }

    const tx_ref = webhookData.tx_ref;
    const status = webhookData.status?.toLowerCase();

    if (!tx_ref) {
      console.log("[WEBHOOK_POST_ERROR] No transaction reference found in:", webhookData);
      return new NextResponse(null, { status: 200 }); // Still acknowledge receipt
    }

    console.log("[WEBHOOK_POST_RECEIVED]", {
      event: webhookData.event,
      tx_ref,
      status,
      type: webhookData.type
    });

    // Find and update the transaction
    const transaction = await db.chapaTransaction.findUnique({
      where: { tx_ref }
    });

    if (!transaction) {
      console.log("[WEBHOOK_POST_ERROR] Transaction not found:", tx_ref);
      return new NextResponse(null, { status: 200 }); // Still acknowledge receipt
    }

    console.log("[WEBHOOK_POST_TRANSACTION]", transaction);

    // Update transaction status based on the event
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
        console.log("[WEBHOOK_POST_PURCHASE_CREATED]", purchase);
      } else {
        console.log("[WEBHOOK_POST_PURCHASE_EXISTS]", existingPurchase);
      }
    } else {
      await db.chapaTransaction.update({
        where: { tx_ref },
        data: { status: TransactionStatus.FAILED }
      });
      console.log("[WEBHOOK_POST_TRANSACTION_FAILED]", { tx_ref, status });
    }

    // Always acknowledge receipt of webhook
    return new NextResponse(null, { status: 200 });
  } catch (error: any) {
    console.error("[WEBHOOK_POST_ERROR]", {
      message: error.message,
      stack: error.stack
    });
    // Still return 200 to acknowledge receipt, even on error
    return new NextResponse(null, { status: 200 });
  }
}

// Handle OPTIONS requests (CORS preflight)
export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Chapa-Signature, x-chapa-signature',
    },
  });
}