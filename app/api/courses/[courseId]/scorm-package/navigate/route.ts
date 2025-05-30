import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import path from "path";
import fs from "fs";
import { parseScormManifest } from "@/lib/scorm";

// Cache for SCORM manifests to improve performance
const manifestCache: Record<string, { manifest: any; timestamp: number }> = {};
const CACHE_TTL = 1000 * 60 * 15; // 15 minutes

export async function GET(
  req: Request,
  { params }: { params: { courseId: string } }
) {
  try {
    const user = await currentUser();

    if (!user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");
    
    if (!itemId) {
      return new NextResponse("Item ID is required", { status: 400 });
    }

    // Check if the course exists and the user has access to it
    const course = await db.course.findUnique({
      where: {
        id: params.courseId,
      },
      include: {
        purchases: {
          where: {
            userId: user.id,
          },
        },
        scormPackage: true,
      },
    });

    if (!course) {
      return new NextResponse("Course not found", { status: 404 });
    }

    // Check if the user is the owner or has purchased the course
    const isOwner = course.userId === user.id;
    const hasPurchased = course.purchases.length > 0;

    if (!isOwner && !hasPurchased) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Check if the course has a SCORM package
    if (!course.scormPackage) {
      return new NextResponse("SCORM package not found", { status: 404 });
    }

    // Try to get the manifest from cache
    const cacheKey = `${course.id}-${course.scormPackage.id}`;
    let manifest;
    
    if (
      manifestCache[cacheKey] && 
      manifestCache[cacheKey].timestamp > Date.now() - CACHE_TTL
    ) {
      manifest = manifestCache[cacheKey].manifest;
    } else {
      // Get the manifest path
      const manifestPath = path.join(course.scormPackage.extractedPath || "", "imsmanifest.xml");

      // Check if the manifest file exists
      if (!fs.existsSync(manifestPath)) {
        return new NextResponse("SCORM manifest not found", { status: 404 });
      }

      // Parse the manifest file
      manifest = await parseScormManifest(manifestPath);
      
      // Store in cache
      manifestCache[cacheKey] = {
        manifest,
        timestamp: Date.now()
      };
    }

    // Find the item in the manifest
    let targetItem = null;
    let targetResource = null;

    // Helper function to recursively find an item by ID
    const findItemById = (items: any[], id: string): any => {
      for (const item of items) {
        if (item.identifier === id) {
          return item;
        }
        if (item.children && item.children.length > 0) {
          const found = findItemById(item.children, id);
          if (found) return found;
        }
      }
      return null;
    };

    // Search for the item in all organizations
    for (const orgId in manifest.organizations) {
      const org = manifest.organizations[orgId];
      const found = findItemById(org.items, itemId);
      if (found) {
        targetItem = found;
        break;
      }
    }

    if (!targetItem) {
      return new NextResponse("Item not found in SCORM package", { status: 404 });
    }

    // If the item has a resource, find the resource details
    if (targetItem.resourceIdentifier) {
      targetResource = manifest.resources[targetItem.resourceIdentifier];
    }

    // If no resource or no href, return an error
    if (!targetResource || !targetResource.href) {
      return new NextResponse("Resource not found for the specified item", { status: 404 });
    }

    // Construct the path to the resource
    const extractedPath = course.scormPackage.extractedPath || "";
    const resourcePath = path.join(extractedPath, targetResource.href);
    
    // Check if the resource file exists
    if (!fs.existsSync(resourcePath)) {
      return new NextResponse("Resource file not found", { status: 404 });
    }

    // Relative path from the extraction root
    const relativePath = path.relative(extractedPath, resourcePath);

    return NextResponse.json({
      item: targetItem,
      resource: targetResource,
      path: relativePath,
      url: `/scorm-content/${path.basename(extractedPath)}/${relativePath.replace(/\\/g, '/')}`,
    });
  } catch (error) {
    console.log("[SCORM_PACKAGE_NAVIGATE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 