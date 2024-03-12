import { InitializeOptions } from "chapa-nodejs"
import { currentUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from 'uuid';
import axios from "axios"
import { db } from "@/lib/db";
import { Course } from "@prisma/client";

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
  const return_url = `${process.env.NEXT_PUBLIC_APP_URL}/courses/${params.courseId}`;
  const callback_url = `${process.env.NEXT_PUBLIC_APP_URL}/api/verify-payment`;

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