import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { TransactionStatus } from "@prisma/client";
import crypto from 'crypto';

// Verify Chapa webhook signature
function verifySignature(payload: string, signature: string | null) {
  if (!signature) return false;
  
  try {
    const hash = crypto
      .createHmac('sha256', process.env.CHAPA_PUBLIC_KEY || '')
      .update(payload)
      .digest('hex');

    return hash === signature;
  } catch (error) {
    console.error("[SIGNATURE_VERIFY_ERROR]", error);
    return false;
  }
}

// Handle OPTIONS requests (CORS preflight)
export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Chapa-Signature',
    },
  });
}

// Handle GET requests
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const searchParams = url.searchParams;
    const headersList = headers();
    
    // Log complete request data
    console.log("[WEBHOOK_GET_FULL_DATA]", {
      method: "GET",
      url: url.toString(),
      search: url.search,
      headers: {
        signature: headersList.get("Chapa-Signature"),
        contentType: headersList.get("content-type"),
        userAgent: headersList.get("user-agent"),
        host: headersList.get("host"),
        all: Object.fromEntries(headersList.entries())
      },
      queryParams: Object.fromEntries(searchParams.entries())
    });

    const signature = headersList.get("Chapa-Signature");
    
    // For GET requests, verify signature if present
    if (signature && !verifySignature(url.search, signature)) {
      console.log("[WEBHOOK_GET_ERROR] Invalid signature", {
        receivedSignature: signature,
        queryString: url.search
      });
      return new NextResponse("Invalid signature", { status: 401 });
    }

    const tx_ref = searchParams.get("tx_ref") || searchParams.get("trx_ref");
    const status = searchParams.get("status")?.toLowerCase();

    console.log("[WEBHOOK_GET_PARAMS]", { 
      tx_ref, 
      status,
      allParams: Object.fromEntries(searchParams.entries())
    });

    if (!tx_ref || !status) {
      console.log("[WEBHOOK_GET_ERROR] Missing required parameters", {
        tx_ref,
        status,
        allParams: Object.fromEntries(searchParams.entries())
      });
      return new NextResponse("Missing tx_ref or status", { status: 400 });
    }

    // Find and update the transaction
    const transaction = await db.chapaTransaction.findUnique({
      where: { tx_ref }
    });

    if (!transaction) {
      console.log("[WEBHOOK_GET_ERROR] Transaction not found:", tx_ref);
      return new NextResponse("Transaction not found", { status: 404 });
    }

    console.log("[WEBHOOK_GET_TRANSACTION]", transaction);

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
        console.log("[WEBHOOK_GET_PURCHASE_CREATED]", purchase);
      } else {
        console.log("[WEBHOOK_GET_PURCHASE_EXISTS]", existingPurchase);
      }
    } else {
      await db.chapaTransaction.update({
        where: { tx_ref },
        data: { status: TransactionStatus.FAILED }
      });
      console.log("[WEBHOOK_GET_TRANSACTION_FAILED]", { tx_ref, status });
    }

    return new NextResponse(null, { status: 200 });
  } catch (error: any) {
    console.error("[WEBHOOK_GET_ERROR]", {
      message: error.message,
      stack: error.stack
    });
    return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 });
  }
}

// Handle POST requests
export async function POST(req: Request) {
  try {
    const body = await req.text();
    const headersList = headers();
    const signature = headersList.get("Chapa-Signature");
    
    // Log complete request data
    console.log("[WEBHOOK_POST_FULL_DATA]", {
      method: "POST",
      headers: {
        signature,
        contentType: headersList.get("content-type"),
        userAgent: headersList.get("user-agent"),
        host: headersList.get("host"),
        // Log all headers
        all: Object.fromEntries(headersList.entries())
      },
      rawBody: body,
      parsedBody: (() => {
        try {
          return JSON.parse(body);
        } catch (e) {
          return { error: "Failed to parse body" };
        }
      })()
    });

    // Verify signature for POST requests
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

    const tx_ref = webhookData?.tx_ref;
    const status = webhookData?.status?.toLowerCase();

    if (!tx_ref) {
      console.log("[WEBHOOK_POST_ERROR] No transaction reference found in:", webhookData);
      return new NextResponse("No transaction reference found", { status: 400 });
    }

    console.log("[WEBHOOK_POST_RECEIVED]", {
      tx_ref,
      status,
      type: webhookData?.type
    });

    // Find and update the transaction
    const transaction = await db.chapaTransaction.findUnique({
      where: { tx_ref }
    });

    if (!transaction) {
      console.log("[WEBHOOK_POST_ERROR] Transaction not found:", tx_ref);
      return new NextResponse("Transaction not found", { status: 404 });
    }

    console.log("[WEBHOOK_POST_TRANSACTION]", transaction);

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

    return new NextResponse(null, { status: 200 });
  } catch (error: any) {
    console.error("[WEBHOOK_POST_ERROR]", {
      message: error.message,
      stack: error.stack
    });
    return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 });
  }
}