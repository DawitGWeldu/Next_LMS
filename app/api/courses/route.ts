import { currentUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ScormVersion } from "@prisma/client";

interface ScormCourseRequestBody {
    title: string;
    description?: string;
    originalZipUrl: string;
    scormVersion: ScormVersion;
    entryPoint: string;
    manifestPath: string;
}

export async function POST(req: Request) {
    try {
        const user  = await currentUser();
        const body = await req.json();

        if (!user?.id) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        // Check if it's a SCORM course creation request
        if (body.originalZipUrl && body.scormVersion && body.entryPoint && body.manifestPath) {
            const { 
                title, 
                description, 
                originalZipUrl, 
                scormVersion, 
                entryPoint, 
                manifestPath 
            } = body as ScormCourseRequestBody;

            const course = await db.course.create({
                data: {
                    userId: user.id,
                    title,
                    description,
                    isPublished: false, // SCORM courses are unpublished by default
                    scormPackage: {
                        create: {
                            title, // Use course title for SCORM package title initially
                            description,
                            version: scormVersion,
                            entryPoint,
                            manifestPath,
                            originalZipUrl,
                            // extractedPath will be set by the extraction process later
                        }
                    }
                },
                include: {
                    scormPackage: true // Ensure scormPackage is returned
                }
            });
            return NextResponse.json(course);
        } else {
            // Regular course creation
            const { title } = body;
        const course = await db.course.create({
            data: {
                userId: user.id,
                title
            }
        });
        return NextResponse.json(course);
        }

    } catch (error) {
        console.log("[COURSES_POST]", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}