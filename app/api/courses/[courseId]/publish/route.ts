import { currentUser } from "@/lib/auth";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { isScormCourse } from "@/lib/course-utils";

export async function PATCH(
  req: Request,
  { params }: { params: { courseId: string } }
) {
  try {
    const user = await currentUser();

    if (!user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const course = await db.course.findUnique({
      where: {
        id: params.courseId,
        userId: user.id,
      },
      include: {
        chapters: {
          include: {
            muxData: true,
          }
        },
        scormPackage: true,
      }
    });

    if (!course) {
      return new NextResponse("Not found", { status: 404 });
    }

    // Check if this is a SCORM course using our utility
    const courseIsScorm = isScormCourse(course);

    // Different validation based on course type
    if (courseIsScorm) {
      // For SCORM courses, we need different required fields
      if (!course.title || !course.categoryId || !course.scormPackage) {
        return new NextResponse("Missing required fields for SCORM course", { status: 401 });
      }
    } else {
      // For regular courses, check chapters are published
      const hasPublishedChapter = course.chapters.some((chapter) => chapter.isPublished);
      if (!course.title || !course.description || !course.imageUrl || !course.categoryId || !hasPublishedChapter) {
        return new NextResponse("Missing required fields for regular course", { status: 401 });
      }
    }

    const publishedCourse = await db.course.update({
      where: {
        id: params.courseId,
        userId: user.id,
      },
      data: {
        isPublished: true,
      }
    });

    return NextResponse.json(publishedCourse);
  } catch (error) {
    console.log("[COURSE_ID_PUBLISH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  } 
}

// This is a dummy export to satisfy Next.js build process
// See: https://github.com/vercel/next.js/discussions/48724
export const dynamic = "force-dynamic";
