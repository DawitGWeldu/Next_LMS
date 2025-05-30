import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import path from "path";
import fs from "fs";
import { parseScormManifest } from "@/lib/scorm";

export async function GET(
  req: Request,
  { params }: { params: { courseId: string } }
) {
  try {
    const user = await currentUser();

    if (!user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const scormPackageId = searchParams.get("scormPackageId");

    if (!scormPackageId) {
      return new NextResponse("SCORM package ID is required", { status: 400 });
    }

    // Check if the course exists and the user has access to it
    const course = await db.course.findUnique({
      where: {
        id: params.courseId,
      },
      include: {
        purchases: {
          where: {
            userId: user.id,
          },
        },
        scormPackage: true,
      },
    });

    if (!course) {
      return new NextResponse("Course not found", { status: 404 });
    }

    // Check if the user is the owner or has purchased the course
    const isOwner = course.userId === user.id;
    const hasPurchased = course.purchases.length > 0;

    if (!isOwner && !hasPurchased) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Check if the course has a SCORM package
    if (!course.scormPackage) {
      return new NextResponse("SCORM package not found", { status: 404 });
    }

    // Get the manifest path
    const manifestPath = path.join(course.scormPackage.extractedPath || "", "imsmanifest.xml");

    // Check if the manifest file exists
    if (!fs.existsSync(manifestPath)) {
      return new NextResponse("SCORM manifest not found", { status: 404 });
    }

    // Parse the manifest file
    const manifest = await parseScormManifest(manifestPath);

    return NextResponse.json({
      manifest,
    });
  } catch (error) {
    console.log("[SCORM_PACKAGE_STRUCTURE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 