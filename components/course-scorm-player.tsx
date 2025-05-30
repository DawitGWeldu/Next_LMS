"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { ScormVersion } from "@prisma/client";
import { toast } from "react-hot-toast";
import { Menu, X } from "lucide-react";

import { ScormPreview } from "@/components/scorm/ScormPreview";
import { ScormStructureNav } from "@/components/scorm-structure-nav";
import {
  ScormContentProvider,
  useScormContent,
} from "@/components/providers/scorm-content-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface CourseScormPlayerProps {
  userId: string;
  courseId: string;
  scormPackageId: string;
  scormUrl: string;
  scormVersion: ScormVersion;
}

// Inner component that uses the context
const CourseScormPlayerContent = ({
  userId,
  courseId,
  scormPackageId,
  scormUrl,
  scormVersion,
}: CourseScormPlayerProps) => {
  const [showSidebar, setShowSidebar] = useState(true);
  const playerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [scormItemPath, setScormItemPath] = useState<string | undefined>(
    undefined
  );

  // Access the shared SCORM content
  const {
    navigationTree,
    navigateToItem,
    currentItemId,
    setCurrentItemId,
    error,
    scormPackage,
    mainScormUrl,
  } = useScormContent();

  // Track SCORM progress with the server
  const handleDataChange = useCallback(
    async (key: string, value: any) => {
      try {
        console.log(`SCORM data changed: ${key} = ${value}`);

        // Determine completion status based on SCORM data
        let completionStatus = undefined;
        let score = undefined;
        let location = undefined;

        // Process SCORM data based on key
        if (
          key === "cmi.core.lesson_status" ||
          key === "cmi.completion_status"
        ) {
          completionStatus = value.toUpperCase();

          // Show success message when content is completed
          if (
            completionStatus === "COMPLETED" ||
            completionStatus === "PASSED"
          ) {
            toast.success("Progress saved successfully!");
          }
        }

        // Extract location data
        if (key === "cmi.core.lesson_location" || key === "cmi.location") {
          location = value;
        }

        // Extract score data
        if (key === "cmi.core.score.raw" || key === "cmi.score.raw") {
          score = parseFloat(value);
        }

        // Collect the full SCORM data
        await axios.post(`/api/courses/${courseId}/scorm-package/tracking`, {
          scormPackageId,
          data: JSON.stringify({ [key]: value }),
          completionStatus,
          location,
          score,
        });
      } catch (error) {
        console.error("Failed to save SCORM tracking data:", error);
        toast.error("Failed to save progress");
      }
    },
    [courseId, scormPackageId]
  );

  // Toggle sidebar for mobile view
  const toggleSidebar = useCallback(() => {
    setShowSidebar((prevState) => !prevState);
  }, []);

  // Handle errors during SCORM loading
  const handleError = useCallback((error: Error) => {
    console.error("SCORM loading error:", error);
    toast.error("Failed to load SCORM content");
  }, []);

  // Handle successful loading of SCORM content
  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  // Handle loading progress updates
  const handleProgress = useCallback((progress: number) => {
    setLoadingProgress(progress);
  }, []);

  return (
    <div className="relative h-full flex flex-col md:flex-row">
      {/* Content */}

      {error ? (
        <div className="flex h-full items-center justify-center bg-slate-100 p-4">
          <p className="text-center text-sm text-red-500">{error.message}</p>
        </div>
      ) : (
        <ScormPreview
          packageUrl={mainScormUrl}
          scormVersion={scormVersion === "SCORM_12" ? "1.2" : ("2004" as any)}
          packageKey={`scorm-${courseId}-${encodeURIComponent(scormUrl)}`}
          itemPath={scormItemPath}
          lmsCommitUrl={`/api/courses/${courseId}/scorm-package/tracking`}
          lmsGetDataUrl={`/api/courses/${courseId}/scorm-package/tracking`}
          onDataChange={handleDataChange}
          onError={handleError}
          onLoad={handleLoad}
          onProgress={handleProgress}
          autoCommitSeconds={30}
          className="h-full w-full"
        />
      )}
    </div>
  );
};

// Main wrapper component that provides the context
export const CourseScormPlayer = ({
  userId,
  courseId,
  scormPackageId,
  scormUrl,
  scormVersion,
}: CourseScormPlayerProps) => {
  // Validate that we have a proper URL
  const [validatedUrl, setValidatedUrl] = useState<string>(scormUrl || "");

  useEffect(() => {
    console.log("CourseScormPlayer received scormUrl:", scormUrl);
    // Ensure the URL is not empty
    if (!scormUrl) {
      console.error("CourseScormPlayer: No SCORM URL provided");
    } else {
      setValidatedUrl(scormUrl);
    }
  }, [scormUrl]);

  return (
    <ScormContentProvider courseId={courseId} scormUrl={validatedUrl}>
      <CourseScormPlayerContent
        userId={userId}
        courseId={courseId}
        scormPackageId={scormPackageId}
        scormUrl={validatedUrl}
        scormVersion={scormVersion}
      />
    </ScormContentProvider>
  );
};
