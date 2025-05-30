import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { ScormVersion as ScormVersionUtil } from "@/lib/scorm";
import { auth } from "@/auth";

// Import Prisma types
import { ScormVersion } from "@prisma/client";

/**
 * GET - Retrieves the SCORM package details for a course
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

    // Check if the course exists and if the user has access to it
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

    // Return the SCORM package details if they exist
    if (!course.scormPackage) {
      return new NextResponse("SCORM package not found for this course", { status: 404 });
    }

    return NextResponse.json(course.scormPackage);
  } catch (error) {
    console.log("[SCORM_PACKAGE_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

/**
 * POST - Creates a new SCORM package for a course
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

    // Only allow teachers to create SCORM packages
    if (user.role !== "TEACHER") {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Check if the course exists and belongs to the user
    const course = await db.course.findUnique({
      where: {
        id: params.courseId,
        userId: user.id,
      },
      include: {
        scormPackage: true,
      }
    });

    if (!course) {
      return new NextResponse("Course not found or you don't have permission", { status: 404 });
    }

    // If the course already has a SCORM package, return an error
    if (course.scormPackage) {
      return new NextResponse("Course already has a SCORM package", { status: 400 });
    }

    // Parse the request body
    const { 
      title, 
      description, 
      version, 
      entryPoint, 
      manifestPath, 
      extractedPath,
      originalZipUrl 
    } = await req.json();

    // Validate the request body
    if (!title || !version || !entryPoint || !manifestPath || !extractedPath || !originalZipUrl) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    // Map the version string to the enum value
    let scormVersion: ScormVersion;
    if (version === "1.2") {
      scormVersion = "SCORM_12";
    } else if (version === "2004") {
      scormVersion = "SCORM_2004";
    } else {
      return new NextResponse("Invalid SCORM version", { status: 400 });
    }

    // Create the SCORM package
    const scormPackage = await db.scormPackage.create({
      data: {
        courseId: params.courseId,
        title,
        description,
        version: scormVersion,
        entryPoint,
        manifestPath,
        extractedPath,
        originalZipUrl,
      }
    });

    return NextResponse.json(scormPackage);
  } catch (error) {
    console.log("[SCORM_PACKAGE_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

/**
 * PATCH - Updates an existing SCORM package
 */
export async function PATCH(
  req: Request,
  { params }: { params: { courseId: string } }
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const { courseId } = params;
    const values = await req.json();

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Verify that the course exists and belongs to the user
    const course = await db.course.findUnique({
      where: {
        id: courseId,
        userId: userId,
      },
      include: {
        scormPackage: true,
      }
    });

    if (!course) {
      return new NextResponse("Course not found", { status: 404 });
    }

    if (!course.scormPackage) {
      return new NextResponse("SCORM package not found", { status: 404 });
    }

    // Update the SCORM package details
    const updatedScormPackage = await db.scormPackage.update({
      where: {
        id: course.scormPackage.id,
      },
      data: {
        title: values.title,
        description: values.description,
      }
    });

    return NextResponse.json(updatedScormPackage);
  } catch (error) {
    console.error("[SCORM_PACKAGE_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

/**
 * DELETE - Deletes a SCORM package
 */
export async function DELETE(
  req: Request,
  { params }: { params: { courseId: string } }
) {
  try {
    const user = await currentUser();

    if (!user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Only allow teachers to delete SCORM packages
    if (user.role !== "TEACHER") {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Check if the course exists and belongs to the user
    const course = await db.course.findUnique({
      where: {
        id: params.courseId,
        userId: user.id,
      },
      include: {
        scormPackage: true,
      }
    });

    if (!course) {
      return new NextResponse("Course not found or you don't have permission", { status: 404 });
    }

    // If the course doesn't have a SCORM package, return an error
    if (!course.scormPackage) {
      return new NextResponse("Course doesn't have a SCORM package", { status: 404 });
    }

    // Delete the SCORM package
    const deletedScormPackage = await db.scormPackage.delete({
      where: {
        courseId: params.courseId,
      }
    });

    // TODO: Also delete the extracted files from the filesystem

    return NextResponse.json(deletedScormPackage);
  } catch (error) {
    console.log("[SCORM_PACKAGE_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 