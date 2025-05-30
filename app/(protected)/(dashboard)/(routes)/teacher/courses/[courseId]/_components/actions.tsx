"use client";

import axios from "axios";
import { Trash } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/modals/confirm-modal";
import { useConfettiStore } from "@/hooks/use-confetti-store";

interface ActionsProps {
  disabled: boolean;
  courseId: string;
  isPublished: boolean;
  isScormCourse?: boolean;
};

export const Actions = ({
  disabled,
  courseId,
  isPublished,
  isScormCourse = false
}: ActionsProps) => {
  const router = useRouter();
  const confetti = useConfettiStore();
  const [isLoading, setIsLoading] = useState(false);

  const onClick = async () => {
    try {
      setIsLoading(true);

      // For SCORM courses, we might need different validation or handling
      const endpoint = isPublished ? 
        `/api/courses/${courseId}/unpublish` : 
        `/api/courses/${courseId}/publish`;

      await axios.patch(endpoint);
      
      toast.success(`Course ${isPublished ? "unpublished" : "published"}`);
      
      // Show confetti only for non-SCORM courses or when specifically desired for SCORM
      if (!isPublished && (!isScormCourse || true)) {
        confetti.onOpen();
      }

      router.refresh();
    } catch (error: any) {
      console.error("Error publishing/unpublishing course:", error);
      
      // Extract specific error message from the response if available
      let errorMessage = "Something went wrong";
      
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        const status = error.response.status;
        const responseData = error.response.data;
        
        if (status === 401) {
          if (isScormCourse) {
            errorMessage = "Course cannot be published. Please ensure all required fields are filled.";
            if (responseData && typeof responseData === 'string' && responseData.includes("Missing required fields")) {
              errorMessage = "Please complete all required fields for SCORM course: title, category, and valid SCORM package";
            }
          } else {
            errorMessage = "Course cannot be published. Please ensure you have a title, description, image, category, and at least one published chapter.";
          }
        } else if (status === 403) {
          errorMessage = "You don't have permission to perform this action";
        } else if (status === 404) {
          errorMessage = "Course not found";
        } else if (responseData && typeof responseData === 'string') {
          errorMessage = responseData;
        }
      } else if (error.request) {
        // The request was made but no response was received
        errorMessage = "Unable to reach server. Please check your connection.";
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
  
  const onDelete = async () => {
    try {
      setIsLoading(true);

      await axios.delete(`/api/courses/${courseId}`);

      toast.success("Course deleted");
      router.push(`/teacher/courses`);
      router.refresh();
    } catch (error: any) {
      console.error("Error deleting course:", error);
      
      let errorMessage = "Something went wrong";
      
      if (error.response) {
        const status = error.response.status;
        const responseData = error.response.data;
        
        if (status === 401) {
          errorMessage = "You need to be signed in to delete this course";
        } else if (status === 403) {
          errorMessage = "You don't have permission to delete this course";
        } else if (status === 404) {
          errorMessage = "Course not found";
        } else if (responseData && typeof responseData === 'string') {
          errorMessage = responseData;
        }
      } else if (error.request) {
        errorMessage = "Unable to reach server. Please check your connection.";
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Determine if the publish/unpublish button should be disabled
  // For SCORM courses, the requirements might be different
  const isActionDisabled = isScormCourse 
    ? isLoading // For SCORM courses, only disable if loading
    : disabled || isLoading;

  return (
    <div className="flex items-center gap-x-2">
      <Button
        onClick={onClick}
        disabled={isActionDisabled}
        variant="outline"
        size="sm"
      >
        {isPublished ? "Unpublish" : "Publish"}
      </Button>
      <ConfirmModal onConfirm={onDelete}>
        <Button size="sm" disabled={isLoading}>
          <Trash className="h-4 w-4" />
        </Button>
      </ConfirmModal>
    </div>
  );
}