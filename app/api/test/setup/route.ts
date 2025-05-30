import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { TEST_COURSES, TEST_CHAPTERS, TEST_USERS } from "../../../../tests/utils/test-data";
import { hash } from "bcryptjs";
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  // Only allow in test environment
  if (process.env.NODE_ENV !== 'test') {
    return new NextResponse("Not allowed", { status: 403 });
  }

  try {
    // Clean up any existing test data first
    await db.purchase.deleteMany({
      where: {
        OR: [
          {
            userId: {
              startsWith: 'test-'
            }
          },
          {
            courseId: '945a7e40-4ed5-4959-b063-1726ae511d3c'
          }
        ]
      }
    });

    await db.chapaTransaction.deleteMany({
      where: {
        OR: [
          {
            userId: {
              startsWith: 'test-'
            }
          },
          {
            courseId: '945a7e40-4ed5-4959-b063-1726ae511d3c'
          }
        ]
      }
    });

    await db.muxData.deleteMany({
      where: {
        chapter: {
          title: {
            startsWith: '[TEST]'
          }
        }
      }
    });

    await db.chapter.deleteMany({
      where: {
        title: {
          startsWith: '[TEST]'
        }
      }
    });

    await db.course.deleteMany({
      where: {
        title: {
          startsWith: '[TEST]'
        }
      }
    });

    await db.user.deleteMany({
      where: {
        OR: [
          { phoneNumber: TEST_USERS.student.phone },
          { phoneNumber: TEST_USERS.teacher.phone }
        ]
      }
    });

    // Create test users
    const hashedPassword = await hash(TEST_USERS.teacher.password, 12);
    
    const teacher = await db.user.create({
      data: {
        id: 'test-teacher-id',
        name: TEST_USERS.teacher.name,
        phoneNumber: TEST_USERS.teacher.phone,
        password: hashedPassword,
        role: 'TEACHER',
        phoneNumberVerified: new Date()
      }
    });

    const student = await db.user.create({
      data: {
        id: 'test-student-id',
        name: TEST_USERS.student.name,
        phoneNumber: TEST_USERS.student.phone,
        password: hashedPassword,
        role: 'STUDENT',
        phoneNumberVerified: new Date()
      }
    });

    // Create test courses
    const freeCourse = await db.course.create({
      data: {
        title: TEST_COURSES.free.title,
        description: TEST_COURSES.free.description,
        price: TEST_COURSES.free.price,
        imageUrl: TEST_COURSES.free.imageUrl,
        isPublished: TEST_COURSES.free.isPublished,
        categoryId: TEST_COURSES.free.categoryId,
        userId: teacher.id,
        chapters: {
          create: [
            {
              title: TEST_CHAPTERS.free.title,
              description: TEST_CHAPTERS.free.description,
              videoUrl: TEST_CHAPTERS.free.videoUrl,
              position: 1,
              isPublished: TEST_CHAPTERS.free.isPublished,
              isFree: TEST_CHAPTERS.free.isFree,
              muxData: {
                create: {
                  assetId: TEST_CHAPTERS.free.muxData.assetId,
                  playbackId: TEST_CHAPTERS.free.muxData.playbackId
                }
              }
            },
            {
              title: TEST_CHAPTERS.published.title,
              description: TEST_CHAPTERS.published.description,
              videoUrl: TEST_CHAPTERS.published.videoUrl,
              position: 2,
              isPublished: TEST_CHAPTERS.published.isPublished,
              isFree: TEST_CHAPTERS.published.isFree,
              muxData: {
                create: {
                  assetId: TEST_CHAPTERS.published.muxData.assetId,
                  playbackId: TEST_CHAPTERS.published.muxData.playbackId
                }
              }
            }
          ]
        }
      },
      include: {
        chapters: {
          include: {
            muxData: true
          }
        }
      }
    });

    const paidCourse = await db.course.create({
      data: {
        title: TEST_COURSES.paid.title,
        description: TEST_COURSES.paid.description,
        price: TEST_COURSES.paid.price,
        imageUrl: TEST_COURSES.paid.imageUrl,
        isPublished: TEST_COURSES.paid.isPublished,
        categoryId: TEST_COURSES.paid.categoryId,
        userId: teacher.id,
        chapters: {
          create: [
            {
              title: TEST_CHAPTERS.published.title,
              description: TEST_CHAPTERS.published.description,
              videoUrl: TEST_CHAPTERS.published.videoUrl,
              position: 1,
              isPublished: TEST_CHAPTERS.published.isPublished,
              isFree: TEST_CHAPTERS.published.isFree,
              muxData: {
                create: {
                  assetId: TEST_CHAPTERS.published.muxData.assetId,
                  playbackId: TEST_CHAPTERS.published.muxData.playbackId
                }
              }
            },
            {
              title: TEST_CHAPTERS.free.title,
              description: TEST_CHAPTERS.free.description,
              videoUrl: TEST_CHAPTERS.free.videoUrl,
              position: 2,
              isPublished: TEST_CHAPTERS.free.isPublished,
              isFree: TEST_CHAPTERS.free.isFree,
              muxData: {
                create: {
                  assetId: TEST_CHAPTERS.free.muxData.assetId,
                  playbackId: TEST_CHAPTERS.free.muxData.playbackId
                }
              }
            }
          ]
        }
      },
      include: {
        chapters: {
          include: {
            muxData: true
          }
        }
      }
    });

    return NextResponse.json({
      teacher: teacher.id,
      student: student.id,
      freeCourse: freeCourse.id,
      paidCourse: paidCourse.id,
      freeCourseUrl: `/courses/${freeCourse.id}`,
      paidCourseUrl: `/courses/${paidCourse.id}`
    });
  } catch (error: any) {
    console.error("[TEST_SETUP_ERROR]", error);
    return new NextResponse(error.message, { status: 500 });
  }
} 

// This is a dummy export to satisfy Next.js build process
// See: https://github.com/vercel/next.js/discussions/48724
export const dynamic = "force-dynamic";
