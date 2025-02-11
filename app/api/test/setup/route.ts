import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { TEST_COURSES, TEST_CHAPTERS } from "../../../../tests/utils/test-data";

export async function POST(req: Request) {
  // Only allow in test environment
  if (process.env.NODE_ENV !== 'test') {
    return new NextResponse("Not allowed", { status: 403 });
  }

  try {
    // Create test courses
    const freeCourse = await db.course.create({
      data: {
        ...TEST_COURSES.free,
        userId: 'test-teacher-id',
        isPublished: true,
        chapters: {
          create: [
            TEST_CHAPTERS.free,
            TEST_CHAPTERS.published
          ]
        }
      }
    });

    const paidCourse = await db.course.create({
      data: {
        ...TEST_COURSES.paid,
        userId: 'test-teacher-id',
        isPublished: true,
        chapters: {
          create: [
            TEST_CHAPTERS.published,
            {
              ...TEST_CHAPTERS.free,
              position: 2
            }
          ]
        }
      }
    });

    return NextResponse.json({
      freeCourse: freeCourse.id,
      paidCourse: paidCourse.id
    });
  } catch (error: any) {
    console.error("[TEST_SETUP_ERROR]", error);
    return new NextResponse(error.message, { status: 500 });
  }
} 