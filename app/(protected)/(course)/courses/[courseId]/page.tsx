import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

import { getCourse } from "@/actions/get-course";

const CourseIdPage = async ({
  params
}: {
  params: { courseId: string; }
}) => {
  const user = await currentUser();
  
  if (!user?.id) {
    return redirect("/");
  }

  const course = await getCourse({
    userId: user.id,
    courseId: params.courseId,
  });

  if (!course) {
    return redirect("/");
  }

  // If course doesn't have chapters or SCORM package, redirect to homepage
  if (course.chapters.length === 0 && !course.scormPackage) {
    return redirect("/");
  }

  const hasScormPackage = !!course.scormPackage;
  const hasChapters = course.chapters.length > 0;

  // If course has a SCORM package, redirect to the SCORM player
  // Removed purchase check for testing
  if (hasScormPackage) {
    return redirect(`/courses/${course.id}/scorm`);
  }

  // If the course has chapters, redirect to the first chapter
  if (hasChapters) {
    return redirect(`/courses/${course.id}/chapters/${course.chapters[0].id}`);
  }

  // If we somehow get here, redirect to home
  return redirect("/");
}
 
export default CourseIdPage;