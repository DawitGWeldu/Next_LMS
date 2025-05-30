import { Course, ScormPackage } from "@prisma/client";

/**
 * Course with optional ScormPackage relation
 */
export type CourseWithScormPackage = Course & {
  scormPackage?: ScormPackage | null;
};

/**
 * Type predicate to check if a course is a SCORM course
 * @param course Course object with optional scormPackage relation
 * @returns boolean indicating if the course is a SCORM course
 */
export function isScormCourse(course: CourseWithScormPackage): course is CourseWithScormPackage & { scormPackage: ScormPackage } {
  return !!course.scormPackage;
}

/**
 * Get the required fields for a course based on its type
 * @param course Course object with optional scormPackage relation
 * @returns Array of required field names
 */
export function getRequiredCourseFields(course: CourseWithScormPackage): string[] {
  const baseRequiredFields = ["title"];
  
  if (isScormCourse(course)) {
    // SCORM courses require fewer manual fields as most content comes from the package
    return baseRequiredFields;
  }
  
  // Regular courses require additional fields
  return [...baseRequiredFields, "description", "imageUrl"];
}

/**
 * Extends an existing course type with SCORM package information
 * @param type Original course type (e.g., CourseWithProgressWithCategory)
 * @returns The same type with added ScormPackage relation
 */
export type WithScormPackage<T extends Course> = T & {
  scormPackage?: ScormPackage | null;
}; 