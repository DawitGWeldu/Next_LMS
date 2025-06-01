import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Chapter, Course, UserProgress } from "@prisma/client";

import { getCourse } from "@/actions/get-course";
import { CourseNavbar } from "../_components/course-navbar";
import { CourseScormPlayer } from "@/components/course-scorm-player";

// Define a type compatible with CourseNavbar's expectations
interface CourseWithUserProgress extends Course {
  chapters: (Chapter & {
    userProgress: UserProgress[] | null;
  })[];
}

export default async function CourseScormPage({
  params,
}: {
  params: { courseId: string };
}) {
  const user = await currentUser();

  if (!user?.id) {
    return redirect("/");
  }

  const courseData = await getCourse({
    userId: user.id,
    courseId: params.courseId,
  });

  if (!courseData) {
    return notFound();
  }

  // If no SCORM package exists, redirect to the course page
  if (!courseData.scormPackage) {
    // If we have chapters, redirect to the first chapter instead of the course page
    if (courseData.chapters.length > 0) {
      return redirect(
        `/courses/${params.courseId}/chapters/${courseData.chapters[0].id}`
      );
    }

    // If no chapters either, redirect to dashboard
    return redirect("/dashboard");
  }

  // Check if the course is purchased or if the user is the publisher
  if (!courseData.isPurchased && courseData.userId !== user.id) {
    // Redirect to course landing page for purchase
    return redirect(`/courses/${params.courseId}`);
  }

  // Convert the course data to match the expected type for CourseNavbar
  const course: CourseWithUserProgress = {
    ...courseData,
    chapters: courseData.chapters.map((chapter) => ({
      ...chapter,
      userProgress: [],
    })),
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="bg-card border-b px-4 py-3 flex items-center shadow-sm flex-shrink-0">
        <h1 className="text-lg font-medium truncate text-foreground">{courseData.title}</h1>
      </div>
      
      <div className="flex-grow overflow-hidden" style={{ height: 'calc(100vh - 57px)' }}>
        {courseData.scormPackage.originalZipUrl && (
          <CourseScormPlayer
            userId={user.id}
            courseId={course.id}
            scormPackageId={courseData.scormPackage.id}
            scormUrl={courseData.scormPackage.originalZipUrl}
            scormVersion={courseData.scormPackage.version || "SCORM_12"}
          />
        )}
      </div>
    </div>
  );
}
