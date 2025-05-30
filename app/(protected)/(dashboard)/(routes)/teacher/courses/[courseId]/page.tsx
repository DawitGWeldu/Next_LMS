import { IconBadge } from "@/components/icon-badge";
import { db } from "@/lib/db";
import { CircleDollarSign, File, LayoutDashboardIcon, ListChecks, FileArchive } from "lucide-react";
import { redirect } from "next/navigation";
import { TitleForm } from "./_components/title-form";
import { DescriptionForm } from "./_components/description-form";
import { ImageForm } from "./_components/image-form";
import { CategoryForm } from "./_components/category-form";
import { AttachmentForm } from "./_components/attachment-form";
import { PriceForm } from "./_components/price-form";
import { ChaptersForm } from "./_components/chapters-form";
import { ScormDetailsForm } from "./_components/scorm-details-form";
import { Banner } from "@/components/banner";
import { Actions } from "./_components/actions";
import { currentUser } from "@/lib/auth";
import { isScormCourse } from "@/lib/course-utils";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";


const CourseIdPage = async ({
    params
}: {
    params: { courseId: string }
}) => {

    const user = await currentUser();
    if (!user?.id) {
        return redirect("/");
    }
    const course = await db.course.findUnique({
        where: {
            id: params.courseId,
            userId: user.id
        },
        include: {
            chapters: {
                orderBy: {
                    position: "asc",
                },
            },
            attachments: {
                orderBy: {
                    createdAt: "desc",
                },
            },
            scormPackage: true,
        },
    });

    const categories = await db.category.findMany({
        orderBy: {
            name: "asc",
        },
    });

    if (!course) {
        return redirect("/");
    }

    // Check if this is a SCORM course
    const isScorm = isScormCourse(course);

    // Define required fields based on course type
    let requiredFields = [];
    
    if (isScorm) {
        // SCORM courses have different requirements
        requiredFields = [
            course.title,
            course.description,
            course.imageUrl,
            course.price,
            course.categoryId,
            // No chapters required for SCORM courses
        ];
    } else {
        // Regular courses require chapters
        requiredFields = [
            course.title,
            course.description,
            course.imageUrl,
            course.price,
            course.categoryId,
            course.chapters.some(chapter => chapter.isPublished),
        ];
    }

    const totalFields = requiredFields.length;
    const completedFields = requiredFields.filter(Boolean).length;

    const completionText = `(${completedFields} | ${totalFields})`

    const isComplete = requiredFields.every(Boolean);

    return (
        <>
            {!course.isPublished && (
                <Banner label="This Course is unpublished. It will not be visible to students." />
            )}
            <div className="p-6">
                <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-y-2">
                        <div className="flex items-center gap-x-2">
                            <h1 className="text-2xl font-medium">
                                Course Setup
                            </h1>
                            {isScorm && (
                                <Badge 
                                    variant="outline"
                                    className="bg-blue-50 text-blue-700 border-blue-200"
                                >
                                    SCORM
                                </Badge>
                            )}
                        </div>
                        <span className="text-sm text-slate-700">
                            Complete all fields {completionText}
                        </span>
                    </div>
                    <Actions
                        disabled={!isComplete}
                        courseId={params.courseId}
                        isPublished={course.isPublished}
                        isScormCourse={isScorm}
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-16">
                    <div>
                        <div className="flex items-center gap-x-2">
                            <IconBadge icon={LayoutDashboardIcon} />
                            <h2 className="text-xl">
                                Customize your course
                            </h2>
                        </div>
                        <TitleForm initialData={course} courseId={course.id} />
                        <DescriptionForm initialData={course} courseId={course.id} />
                        <ImageForm initialData={course} courseId={course.id} />
                        <CategoryForm
                            initialData={course}
                            courseId={course.id}
                            options={categories.map((category) => ({
                                label: category.name,
                                value: category.id,
                            }))}
                        />

                        {isScorm && (
                            <ScormDetailsForm 
                                initialData={{ 
                                    scormPackage: course.scormPackage ? {
                                        ...course.scormPackage,
                                        createdAt: course.scormPackage.createdAt.toISOString(),
                                        updatedAt: course.scormPackage.updatedAt.toISOString(),
                                    } : null 
                                }}
                                courseId={course.id}
                            />
                        )}
                    </div>
                    <div className="space-y-6">
                        {!isScorm && (
                            <div>
                                <div className="flex items-center gap-x-2">
                                    <IconBadge icon={ListChecks} />
                                    <h2 className="text-xl">
                                        Course chapters
                                    </h2>
                                </div>
                                <ChaptersForm
                                    initialData={course}
                                    courseId={course.id}
                                />
                            </div>
                        )}
                        <div>
                            <div className="flex items-center gap-x-2">
                                <IconBadge icon={CircleDollarSign} />
                                <h2 className="text-xl">
                                    Sell your course
                                </h2>
                            </div>
                            <PriceForm
                                initialData={course}
                                courseId={course.id}
                            />
                        </div>
                        <div>
                            <div className="flex items-center gap-x-2">
                                <IconBadge icon={File} />
                                <h2 className="text-xl">
                                    Resources & Attachments
                                </h2>
                            </div>
                            <AttachmentForm
                                initialData={course}
                                courseId={course.id}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default CourseIdPage;