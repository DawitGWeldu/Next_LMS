import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { ScormCompletionStatus } from "@prisma/client";

/**
 * GET - Retrieves the SCORM tracking data for a user
 */
export async function GET(
  req: Request,
  { params }: { params: { courseId: string } }
) {
  try {
    const user = await currentUser();

    if (!user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Check if the course exists
    const course = await db.course.findUnique({
      where: {
        id: params.courseId,
      },
      include: {
        scormPackage: true,
      }
    });

    if (!course) {
      return new NextResponse("Course not found", { status: 404 });
    }

    // Check if the course has a SCORM package
    if (!course.scormPackage) {
      return new NextResponse("Course doesn't have a SCORM package", { status: 404 });
    }

    // Get the tracking data
    const tracking = await db.scormTracking.findUnique({
      where: {
        userId_scormPackageId: {
          userId: user.id,
          scormPackageId: course.scormPackage.id,
        },
      },
    });

    // If no tracking data exists, return an empty object
    if (!tracking) {
      return NextResponse.json({
        data: "{}",
        completionStatus: "NOT_ATTEMPTED",
        location: null,
        score: null,
      });
    }

    return NextResponse.json(tracking);
  } catch (error) {
    console.log("[SCORM_TRACKING_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

/**
 * POST - Creates or updates SCORM tracking data
 */
export async function POST(
  req: Request,
  { params }: { params: { courseId: string } }
) {
  try {
    const user = await currentUser();

    if (!user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Check if the course exists
    const course = await db.course.findUnique({
      where: {
        id: params.courseId,
      },
      include: {
        scormPackage: true,
      }
    });

    if (!course) {
      return new NextResponse("Course not found", { status: 404 });
    }

    // Check if the course has a SCORM package
    if (!course.scormPackage) {
      return new NextResponse("Course doesn't have a SCORM package", { status: 404 });
    }

    // Parse the request body
    const { data, completionStatus, location, score } = await req.json();

    if (!data) {
      return new NextResponse("Missing data field", { status: 400 });
    }

    // Map completion status string to enum if provided
    let statusEnum: ScormCompletionStatus | undefined;
    if (completionStatus) {
      switch (completionStatus.toUpperCase()) {
        case "NOT_ATTEMPTED":
          statusEnum = "NOT_ATTEMPTED";
          break;
        case "INCOMPLETE":
          statusEnum = "INCOMPLETE";
          break;
        case "COMPLETED":
          statusEnum = "COMPLETED";
          break;
        case "PASSED":
          statusEnum = "PASSED";
          break;
        case "FAILED":
          statusEnum = "FAILED";
          break;
        default:
          return new NextResponse("Invalid completion status", { status: 400 });
      }
    }

    // Create or update the tracking data
    const tracking = await db.scormTracking.upsert({
      where: {
        userId_scormPackageId: {
          userId: user.id,
          scormPackageId: course.scormPackage.id,
        },
      },
      update: {
        data,
        completionStatus: statusEnum,
        location: location || undefined,
        score: score !== undefined ? score : undefined,
      },
      create: {
        userId: user.id,
        scormPackageId: course.scormPackage.id,
        data,
        completionStatus: statusEnum || "NOT_ATTEMPTED",
        location: location || null,
        score: score !== undefined ? score : null,
      },
    });

    return NextResponse.json(tracking);
  } catch (error) {
    console.log("[SCORM_TRACKING_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 