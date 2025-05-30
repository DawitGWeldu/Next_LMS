"use client";

import axios from "axios";
import { useEffect, useState, useCallback } from "react";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { ScormPlayer } from "@/components/scorm-player";

interface CourseScormPlayerProps {
  courseId: string;
  chapterId: string;
  nextChapterId?: string;
  isLocked: boolean;
  completeOnEnd: boolean;
  title: string;
}

export const CourseScormPlayer = ({
  courseId,
  chapterId,
  nextChapterId,
  isLocked,
  completeOnEnd,
  title,
}: CourseScormPlayerProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasScormPackage, setHasScormPackage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Check if the course has a SCORM package
  useEffect(() => {
    const checkScormPackage = async () => {
      try {
        setIsLoading(true);
        const response = await axios.get(`/api/courses/${courseId}/scorm-package`);
        
        if (response.data) {
          setHasScormPackage(true);
        }
        setIsLoading(false);
      } catch (error: any) {
        if (error.response?.status === 404) {
          // Not found is expected for courses without SCORM
          setHasScormPackage(false);
        } else {
          console.error("Error checking SCORM package:", error);
          setError("Failed to check SCORM content");
        }
        setIsLoading(false);
      }
    };

    if (!isLocked) {
      checkScormPackage();
    } else {
      setIsLoading(false);
    }
  }, [courseId, isLocked]);

  // Mark chapter as completed if course has no SCORM package
  const markChapterAsCompleted = useCallback(async () => {
    try {
      await axios.put(`/api/courses/${courseId}/chapters/${chapterId}/progress`, {
        isCompleted: true,
      });

      toast.success("Progress updated");
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    }
  }, [courseId, chapterId, router]);

  // If course has no SCORM package and chapter should complete on view
  useEffect(() => {
    if (!isLoading && !hasScormPackage && !isLocked && completeOnEnd) {
      markChapterAsCompleted();
    }
  }, [isLoading, hasScormPackage, isLocked, completeOnEnd, markChapterAsCompleted]);

  if (isLoading) {
    return (
      <div className="relative aspect-video">
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
          <Loader2 className="h-8 w-8 animate-spin text-secondary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative aspect-video">
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-red-500">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!hasScormPackage) {
    return (
      <div className="relative aspect-video">
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-secondary">
          <p className="text-center p-4">
            This chapter does not contain SCORM content.
            {completeOnEnd && " Progress has been marked as completed."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScormPlayer
      scormUrl={`/api/courses/${courseId}/scorm-package?chapterId=${chapterId}`}
      scormVersion="SCORM_12"
      onDataChange={(data) => {
        if (data?.complete && completeOnEnd) {
          markChapterAsCompleted();
        }
      }}
    />
  );
}; 