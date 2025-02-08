import { InitializeOptions } from "chapa-nodejs"
import { currentUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from 'uuid';
import axios from "axios"
import { db } from "@/lib/db";
import { Course, TransactionStatus } from "@prisma/client";
import { NextApiRequest, NextApiResponse } from "next";

export async function POST(
  req: Request,
  { params }: { params: { courseId: string } }
) {
  try {
    const user = await currentUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    console.log("[CHECKOUT_INIT] User:", user.id, "Course:", params.courseId);

    const course = await db.course.findUnique({
      where: {
        id: params.courseId,
        isPublished: true,
      }
    });

    if (!course) {
      console.log("[CHECKOUT_ERROR] Course not found:", params.courseId);
      return new NextResponse("Course not found", { status: 404 });
    }

    const purchase = await db.purchase.findUnique({
      where: {
        userId_courseId: {
          userId: user.id!,
          courseId: params.courseId
        }
      }
    });

    if (purchase) {
      console.log("[CHECKOUT_ERROR] Course already purchased:", params.courseId);
      return new NextResponse("Already purchased", { status: 400 });
    }

    const tx_reference = uuidv4();
    // Return URL is where the user will be redirected after payment
    const return_url = `${process.env.NEXT_PUBLIC_APP_URL}/api/courses/${params.courseId}/enroll?trx_ref=${tx_reference}`;
    // Callback URL is where Chapa will send the webhook
    const callback_url = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook`;

    console.log("[CHECKOUT_NEW] Creating new transaction:", tx_reference, {
      return_url,
      callback_url
    });

    try {
      const chapaPayload = {
        amount: course.price || 100,
        currency: "ETB",
        tx_ref: tx_reference,
        return_url: return_url,
        callback_url: callback_url
      };

      console.log("[CHAPA_PAYLOAD]", JSON.stringify(chapaPayload, null, 2));

      const res = await axios({
        method: "post",
        url: "https://api.chapa.co/v1/transaction/initialize",
        headers: {
          "Authorization": `Bearer ${process.env.NEXT_PUBLIC_CHAPA_SECRET_KEY}`,
          "Content-Type": "application/json"
        },
        data: chapaPayload
      });

      console.log("[CHAPA_INIT_RESPONSE]", JSON.stringify(res.data, null, 2));

      if (res.data?.status === "success") {
        // Create transaction record
        await db.chapaTransaction.create({
          data: {
            courseId: course.id,
            tx_ref: tx_reference,
            userId: user.id!,
            status: TransactionStatus.PENDING
          }
        });

        console.log("[CHECKOUT_SUCCESS] Created transaction:", tx_reference);
        return NextResponse.json({ url: res.data.data.checkout_url });
      } else {
        console.error("[CHAPA_INIT_ERROR] Failed response:", res.data);
        throw new Error("Failed to initialize payment: Invalid response");
      }
    } catch (error: any) {
      console.error("[CHAPA_PAYMENT_ERROR]", {
        message: error.message,
        response: error.response?.data
      });
      return new NextResponse(
        `Payment initialization failed: ${error.response?.data?.message || error.message}`, 
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("[COURSE_CHECKOUT_ERROR]", {
      message: error.message,
      stack: error.stack
    });
    return new NextResponse("Internal Error", { status: 500 });
  }
}


// export async function GET(req: Request) {
//   const url = new URL(req.url);
//   const searchParams = url.searchParams;
//   console.log("[CALLBACK RAN]: [status]? ", url, searchParams);

//   const tx_ref = searchParams.get('trx_ref')!;
//     try {
//       const transaction = await db.chapaTransaction.findFirst({
//         where: {
//           tx_ref: tx_ref,
//           status: 'PENDING'
//         }
//       });
//       console.log("[TRANSACTION]: ", JSON.stringify(transaction));

//       await db.purchase.create({
//         data: {
//           courseId: transaction!.courseId,
//           userId: transaction!.userId,
//         }
//       });
//       console.log("[CALLBACK RAN]: Success");

//       return NextResponse.json({ status: "Transaction Success" });
//     } catch (error) {
//       throw new Error("Transaction Data not found");
//     }


//   // if (searchParams.has("status")) {
//   //   if (searchParams.get("status") !== "success") {
//   //     return NextResponse.json({ status: "Transaction Failed" });
//   //   }

    
//   // }

//   return NextResponse.json({ message: "200" }, { status: 200 });
// }
