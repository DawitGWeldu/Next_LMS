import { db } from "@/lib/db";
import { ChapaTransaction, Course } from "@prisma/client"
import { NextApiRequest, NextApiResponse } from 'next';
import { NextRequest, NextResponse } from "next/server";

async function OPTIONS(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*'); // Replace '*' with specific origins if needed
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
    res.status(200).end();
    console.log()
}
type Params = {
    status?: string
    trx_ref?: string
    callback?: string
    _?: string
}
export async function GET(
    req: NextRequest, context: { params: Params }) {
    const url = req.clone().url;
    const search = new URL(url);
    // const searchParams = new URLSearchParams(search);
    console.log("[CALLBACK RAN]: [status]? ", url)

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

GET.options = OPTIONS; 

// This is a dummy export to satisfy Next.js build process
// See: https://github.com/vercel/next.js/discussions/48724
export const dynamic = "force-dynamic";
