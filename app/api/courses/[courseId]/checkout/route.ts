import { InitializeOptions } from "chapa-nodejs"
import { currentUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from 'uuid';
import axios from "axios"
import { db } from "@/lib/db";
import { Course } from "@prisma/client";
import { NextApiRequest, NextApiResponse } from "next";

export async function POST(
  req: Request,
  { params }: { params: { courseId: string } }
) {


  const user = await currentUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });

  }


  const course = await db.course.findUnique({
    where: {
      id: params.courseId,
      isPublished: true,
    }
  })
  const chapter = await db.chapter.findFirst({
    where: {
      courseId: params.courseId,
      isPublished: true,
    }
  })
  const purchase = await db.purchase.findUnique({
    where: {
      userId_courseId: {
        userId: user.id!,
        courseId: params.courseId
      }
    }
  })

  if (purchase) {
    return new NextResponse("Already purchased", { status: 400 });
  }


  const tx_reference = uuidv4();;
  const return_url = `${process.env.NEXT_PUBLIC_APP_URL}/courses/${params.courseId}/chapters/${chapter?.id}`;
  const callback_url = `${process.env.NEXT_PUBLIC_APP_URL}/courses/${params.courseId}/chapters/${chapter?.id}`;

  let checkout_url = null;
  const res = await axios({
    method: "post",
    url: "https://api.chapa.co/v1/transaction/initialize",
    headers: {
      "Authorization": `Bearer ${process.env.CHAPA_SECRET_KEY}`
    },
    data: {
      currency: "ETB",
      first_name: "F",
      last_name: "L",
      amount: 100,
      tx_ref: tx_reference,
      callback_url: callback_url,
      return_url: return_url
    }
  })

  if (res.data.status == "success") {
    checkout_url = res.data.data.checkout_url
  }

  await db.chapaTransaction.create({
    data: {
      courseId: course!.id,
      tx_ref: tx_reference,
      userId: user.id!
    }
  })
  return NextResponse.json({ url: checkout_url });
}


export async function GET(
  req: Request) {
  const url = req.clone().url;
  const search = new URL(url);
  const searchParams = new URLSearchParams(url);
  console.log("[CALLBACK RAN]: [status]? ", url, searchParams)

  // let tx_ref: string = "";
  // if (searchParams.has("status")) {
  //     if (searchParams.get("status") != "success") {
  //         return Response.json({ status: "Transaction Failed" });
  //     }
  //     tx_ref = searchParams.get('trx_ref')!;
  //     try {
  //         const transaction = await db.chapaTransaction.findFirst({
  //             where: {
  //                 tx_ref: searchParams.get('trx_ref')!,
  //                 status: 'PENDING'
  //             }
  //         })
  //         console.log("[TRANSACTION]: ", JSON.stringify(transaction))

  //         await db.purchase.create({
  //             data: {
  //                 courseId: transaction!.courseId,
  //                 userId: transaction!.userId,
  //             }
  //         });
  //         console.log("[CALLBACK RAN]: Success")

  //         return Response.json({ status: "Transaction Success" });
  //     } catch (error) {
  //         throw new Error("Transaction Data not found")
  //     }

  // }
  return NextResponse.json({ "message": "200" }, { status: 200 });
}