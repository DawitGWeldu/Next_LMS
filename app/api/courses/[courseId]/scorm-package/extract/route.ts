import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import path from "path";
import fs from "fs";
import { 
  extractScormPackage, 
  validateScormPackage, 
  parseScormManifest,
  getScormVersion as getScormVersionUtil,
} from "@/lib/scorm";
import { ScormVersion } from "@prisma/client";

// Base directory for SCORM package extraction
const EXTRACT_BASE_DIR = path.join(process.cwd(), 'public', 'scorm-content');

/**
 * POST - Extract and process a SCORM package
 */
export async function POST(
  req: Request,
  { params }: { params: { courseId: string } }
) {
  try {
    const user = await currentUser();

    if (!user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Only allow teachers to extract SCORM packages
    if (user.role !== "TEACHER") {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Check if the course exists and belongs to the user
    const course = await db.course.findUnique({
      where: {
        id: params.courseId,
        userId: user.id,
      },
      include: {
        scormPackage: true,
      }
    });

    if (!course) {
      return new NextResponse("Course not found or you don't have permission", { status: 404 });
    }

    // If the course already has a SCORM package, return an error
    if (course.scormPackage) {
      return new NextResponse("Course already has a SCORM package", { status: 400 });
    }

    // Parse the request body
    const { zipPath, originalZipUrl } = await req.json();

    if (!zipPath || !originalZipUrl) {
      return new NextResponse("Missing zipPath or originalZipUrl", { status: 400 });
    }

    // Create a unique extraction directory
    const extractionDir = path.join(EXTRACT_BASE_DIR, params.courseId);
    
    // Ensure the base directory exists
    if (!fs.existsSync(EXTRACT_BASE_DIR)) {
      fs.mkdirSync(EXTRACT_BASE_DIR, { recursive: true });
    }

    // Extract the SCORM package
    await extractScormPackage(zipPath, extractionDir);

    // Validate the extracted package
    const isValid = await validateScormPackage(extractionDir);
    if (!isValid) {
      // Clean up the extraction directory
      fs.rmSync(extractionDir, { recursive: true, force: true });
      return new NextResponse("Invalid SCORM package", { status: 400 });
    }

    // Parse the manifest file
    const manifestPath = path.join(extractionDir, 'imsmanifest.xml');
    const manifest = await parseScormManifest(manifestPath);

    // Map SCORM version to Prisma enum
    let scormVersion: ScormVersion;
    if (manifest.version === "1.2") {
      scormVersion = "SCORM_12";
    } else if (manifest.version === "2004") {
      scormVersion = "SCORM_2004";
    } else {
      // Clean up the extraction directory
      fs.rmSync(extractionDir, { recursive: true, force: true });
      return new NextResponse("Unsupported SCORM version", { status: 400 });
    }

    // Ensure we have an entry point
    if (!manifest.entryPoint) {
      // Clean up the extraction directory
      fs.rmSync(extractionDir, { recursive: true, force: true });
      return new NextResponse("No entry point found in SCORM package", { status: 400 });
    }

    // Create the SCORM package record
    const scormPackage = await db.scormPackage.create({
      data: {
        courseId: params.courseId,
        title: manifest.metadata?.title || course.title,
        description: manifest.metadata?.description || course.description,
        version: scormVersion,
        entryPoint: manifest.entryPoint,
        manifestPath: path.relative(extractionDir, manifestPath),
        extractedPath: extractionDir,
        originalZipUrl,
      }
    });

    return NextResponse.json({
      scormPackage,
      manifest,
    });
  } catch (error) {
    console.log("[SCORM_PACKAGE_EXTRACT]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 