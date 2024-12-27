import { Chapter, Course, Purchase, UserProgress } from "@prisma/client"
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CourseProgress } from "@/components/course-progress";

import { CourseSidebarItem } from "./course-sidebar-item";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { BadgeCheck, ChevronRight, LockKeyhole } from "lucide-react";

interface CourseSidebarProps {
  course: Course & {
    chapters: (Chapter & {
      userProgress: UserProgress[] | null;
    })[]
  };
  progressCount: number;
};

export const CourseSidebar = async ({
  course,
  progressCount,
}: CourseSidebarProps) => {
  const user = await currentUser();

  if (!user?.id) {
    return redirect("/");
  }

  const purchase: Purchase|null = await db.purchase.findUnique({
    where: {
      userId_courseId: {
        userId: user.id,
        courseId: course.id,
      }
    }
  });

  return (
    <>
      <div className="py-4 flex flex-col">
        <h1 className="font-semibold">
          {course.title.length > 25 ? (
            `${course.title.substring(0, 25)}...`
          ): (
            course.title
          )}
        </h1>
        {!purchase && (
          <div className="mt-2">
            <CourseProgress
              variant="success"
              value={progressCount}
            />
          </div>
        )}
      </div>
     

      <nav className="grid items-start gap-4 w-full">
        {course.chapters.map((item, index) => {
          const href = `/courses/${item.courseId}/chapters/${item.id}`;
          return (
            href && (
              <>
              <Link key={index} href={href}>
                <span
                  className={cn(
                    "group h-12 rounded-md flex items-center px-3 py-3 text-sm font-medium bg-accent hover:bg-transparent hover:border-b-2 hover:text-accent-foreground",
                    !!item.userProgress?.[0]?.isCompleted && "text-emerald-700 hover:text-emerald-700"
                  )}
                >
                  {!item.isFree && !purchase ? (
                    <LockKeyhole className="mr-2 h-4 w-4" />
                  ) : !!item.userProgress?.[0]?.isCompleted ? (
                      <BadgeCheck className="mr-2 h-4 w-4" />
                    ) : (
                      <ChevronRight className="mr-2 h-4 w-4" />
                    )}
                  
                  <span>{item.title}</span>
                </span>
              </Link>
              
              </>
            )
          )
        })}
      </nav>
    </>
  )
}