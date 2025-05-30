import { Category, Chapter, Course, ScormPackage } from "@prisma/client";

import { db } from "@/lib/db";
import { getProgress } from "@/actions/get-progress";

type CourseWithDetails = Course & {
  category: Category | null;
  chapters: Chapter[];
  scormPackage: ScormPackage | null;
  progress: number | null;
  isPurchased: boolean;
};

interface GetCourseProps {
  userId: string;
  courseId: string;
}

export const getCourse = async ({ 
  userId, 
  courseId 
}: GetCourseProps): Promise<CourseWithDetails | null> => {
  try {
    const purchase = await db.purchase.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId,
        }
      }
    });

    const course = await db.course.findUnique({
      where: {
        id: courseId,
        isPublished: true,
      },
      include: {
        category: true,
        chapters: {
          where: {
            isPublished: true,
          },
          orderBy: {
            position: "asc"
          }
        },
        scormPackage: true,
      }
    });

    if (!course) {
      return null;
    }

    let progress = null;

    if (purchase) {
      progress = await getProgress(userId, courseId);
    }

    return {
      ...course,
      progress,
      isPurchased: !!purchase
    };
  } catch (error) {
    console.log("[GET_COURSE]", error);
    return null;
  }
}; 