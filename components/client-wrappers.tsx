"use client";

import { useState, useEffect, useRef, forwardRef } from "react";
import { ScormUpload, ScormMetadata, useScormUploader, ScormUploadHandle } from "@/components/scorm-upload";

// This is a client-only wrapper for the ScormUpload component to avoid hydration mismatches
export function ClientScormUpload(props: {
  onChange: (url?: string) => void;
  onScormData?: (data: ScormMetadata) => void;
  onValidationError?: (error: string) => void;
  onFileValidated?: (file: File, metadata: ScormMetadata) => void;
  onUploadProgress?: (progress: number) => void;
  isDisabled?: boolean;
  deferUpload?: boolean;
}) {
  const [isClient, setIsClient] = useState(false);

  // Only render the actual component on the client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    // Return a placeholder during SSR to prevent hydration mismatch
    return (
      <div 
        className="border-2 border-dashed rounded-md p-6 min-h-[200px] flex items-center justify-center text-sm text-slate-500"
        suppressHydrationWarning
      >
        <span suppressHydrationWarning>Loading SCORM uploader...</span>
      </div>
    );
  }

  // Once we're on the client, render the actual component
  return <ScormUpload {...props} />;
}

// Client-side wrapper with forwarded ref for the ScormUpload component
export const ClientScormUploadWithRef = forwardRef<
  ScormUploadHandle,
  {
    onChange: (url?: string) => void;
    onScormData?: (data: ScormMetadata) => void;
    onValidationError?: (error: string) => void;
    onFileValidated?: (file: File, metadata: ScormMetadata) => void;
    onUploadProgress?: (progress: number) => void;
    isDisabled?: boolean;
    deferUpload?: boolean;
  }
>((props, ref) => {
  const [isClient, setIsClient] = useState(false);

  // Only render the actual component on the client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    // Return a placeholder during SSR to prevent hydration mismatch
    return (
      <div 
        className="border-2 border-dashed rounded-md p-6 min-h-[200px] flex items-center justify-center text-sm text-slate-500"
        suppressHydrationWarning
      >
        <span suppressHydrationWarning>Loading SCORM uploader...</span>
      </div>
    );
  }

  // Once we're on the client, render the actual component with the ref
  return <ScormUpload {...props} ref={ref} />;
});

ClientScormUploadWithRef.displayName = "ClientScormUploadWithRef";

// Export a hook to use the ScormUploader in consumer components
export { useScormUploader }; 