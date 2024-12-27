"use client"
import { Chapter, Course, UserProgress } from "@prisma/client"
import { CourseMobileSidebar } from "./course-mobile-sidebar";
import Link from "next/link";
import { Icons } from "@/components/icons";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { LucideChevronsRightLeft } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

interface CourseNavbarProps {
  course: Course & {
    chapters: (Chapter & {
      userProgress: UserProgress[] | null;
    })[];
  };
  progressCount: number;
};

export const CourseNavbar = ({
  course,
  progressCount,
}: CourseNavbarProps) => {
  const pathname = usePathname();
  const isTeacherPage = pathname?.startsWith("/teacher");
  const isCoursePage = pathname?.includes("/courses");
  const isSearchPage = pathname === "/search";
  const { data: session } = useSession();
  return (
    <div className="flex gap-6 md:gap-10">
      <Link href="/" className="hidden items-center space-x-2 md:flex">
        <Icons.logo />
        <span className="hidden font-bold sm:inline-block">
          {siteConfig.name}
        </span>
      </Link>
      <CourseMobileSidebar
        course={course}
        progressCount={progressCount}
      />
      <div className="flex gap-x-2 ml-auto">
        {isTeacherPage || isCoursePage && (
          <Link href="/search">
            <Button size="sm" variant="ghost">
              <LucideChevronsRightLeft className="h-4 w-4 mr-2" />
              Exit
            </Button>
          </Link>
        ) }
        { (session?.user.role == "TEACHER") && (
          <Link href="/teacher/courses">
            <Button size="sm" variant="ghost">
              Teacher mode
            </Button>
          </Link>
        )}
       
      </div>     
    </div>
  )
}