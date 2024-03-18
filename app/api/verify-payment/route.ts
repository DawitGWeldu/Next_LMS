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

export async function GET(
    req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    console.log("[CALLBACK RAN]: [QUERY PARAMS]? ", searchParams)

    let tx_ref: string = "";
    if (searchParams.has("status")) {
        if (searchParams.get("status") != "success") {
            return Response.json({ status: "Transaction Failed" });
        }
        tx_ref = searchParams.get('trx_ref')!;
        try {
            const transaction = await db.chapaTransaction.findFirst({
                where: {
                    tx_ref: searchParams.get('trx_ref')!,
                    status: 'PENDING'
                }
            })
            console.log("[TRANSACTION]: ",JSON.stringify(transaction))

            await db.purchase.create({
                data: {
                    courseId: transaction!.courseId,
                    userId: transaction!.userId,
                }
            });
            console.log("[CALLBACK RAN]: Success")

            return Response.json({ status: "Transaction Success" });
        } catch (error) {
            throw new Error("Transaction Data not found")
        }

    }
    return NextResponse.json({ "headers": req.headers, "url": req.url }, { status: 200 });
}
GET.options = OPTIONS; 