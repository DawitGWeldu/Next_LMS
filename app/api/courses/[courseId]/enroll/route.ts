import { InitializeOptions } from "chapa-nodejs"
import { currentUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from 'uuid';
import axios from "axios"
import { db } from "@/lib/db";
import { Course } from "@prisma/client";


export async function GET(
  req: Request,
  { params }: { params: { courseId: string } }) {
  // const url = new URL(req.url);
  // const searchParams = url.searchParams;


  const user = await currentUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });

  }

  try {
    const chapa_transaction = await db.chapaTransaction.findFirst({
      where: {
        courseId: params.courseId,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    if (!chapa_transaction) {
      return new NextResponse("Trasaction not found", { status: 404 });
    }
    const tx_ref = chapa_transaction.tx_ref;
    console.log("[CALLBACK RAN]: [tx_ref]? ", tx_ref || "no tx_ref");
    await db.purchase.create({
      data: {
        courseId: chapa_transaction.courseId,
        userId: chapa_transaction.userId,
      }
    });
    console.log("[CALLBACK RAN]: Success");
  } catch (error) {
    console.log("[ERROR]: ", error);
  }

  // try {
  //   // const transaction = await db.chapaTransaction.findFirst({
  //   //   where: {
  //   //     tx_ref: tx_ref,
  //   //     status: 'PENDING'
  //   //   }
  //   // });
  //   // console.log("[TRANSACTION]: ", JSON.stringify(transaction));

  //   // await db.purchase.create({
  //   //   data: {
  //   //     courseId: transaction!.courseId,
  //   //     userId: transaction!.userId,
  //   //   }
  //   // });
  //   console.log("[CALLBACK RAN]: Success");

  //   return NextResponse.json({ status: "Transaction Success" });
  // } catch (error) {
  //   throw new Error("Transaction Data not found");
  // }


  // if (searchParams.has("status")) {
  //   if (searchParams.get("status") !== "success") {
  //     return NextResponse.json({ status: "Transaction Failed" });
  //   }


  // }

  return NextResponse.json({ message: "Course enrolled" }, { status: 200 });
}
