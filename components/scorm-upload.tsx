"use client";

import { useState, useRef, forwardRef, useImperativeHandle } from "react";
import toast from "react-hot-toast";
import { Loader2, FileArchive, AlertCircle, Upload, X } from "lucide-react";

import { useUploadThing } from "@/lib/uploadthing";
import { Button } from "@/components/ui/button";
import { ScormVersion } from "@prisma/client";
import { getClientScormPreviewDetails, ScormPreviewResult } from "@/lib/scorm";
import { Progress } from "@/components/ui/progress";

interface ScormUploadProps {
  onChange: (url?: string) => void;
  onScormData?: (data: ScormMetadata) => void;
  onValidationError?: (error: string) => void;
  onFileValidated?: (file: File, metadata: ScormMetadata) => void;
  onUploadProgress?: (progress: number) => void;
  isDisabled?: boolean;
  deferUpload?: boolean;
}

export interface ScormMetadata {
  title: string;
  description?: string;
  version: ScormVersion;
  entryPoint: string;
  manifestPath: string;
}

export interface ScormUploadHandle {
  uploadFile: (file?: File) => Promise<void>;
}

export const ScormUpload = forwardRef<ScormUploadHandle, ScormUploadProps>(({
  onChange,
  onScormData,
  onValidationError,
  onFileValidated,
  onUploadProgress,
  isDisabled = false,
  deferUpload = false
}, ref) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isValidated, setIsValidated] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<ScormMetadata | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Use the uploadthing hook
  const { startUpload } = useUploadThing("scormPackage", {
    onClientUploadComplete: (res) => {
      setIsUploading(false);
      setUploadProgress(100);
      const url = res?.[0]?.url;
      if (url) {
        setUploadedUrl(url);
        onChange(url);
        toast.success("SCORM package uploaded successfully");
      }
    },
    onUploadError: (error: Error) => {
      setIsUploading(false);
      setUploadProgress(0);
      const errorMessage = error?.message || "Upload failed";
      setError(errorMessage);
      toast.error(`Upload error: ${errorMessage}`);
    },
    onUploadProgress: (progress) => {
      // Update progress state
      const progressPercentage = Math.round(progress);
      setUploadProgress(progressPercentage);
      
      // Call the parent's progress callback if provided
      if (onUploadProgress) {
        onUploadProgress(progressPercentage);
      }
    }
  });

  // Handle file selection and validation
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setSelectedFile(file);
    setIsValidating(true);
    setError(null);
    setUploadProgress(0);
    
    try {
      // Use our new client-side validation utility
      const result = await getClientScormPreviewDetails(file);
      
      if (result.isValid && result.metadata) {
        // Convert the metadata to the correct type for our component
        const convertedMetadata: ScormMetadata = {
          title: result.metadata.title,
          description: result.metadata.description,
          // Convert the string version to the Prisma enum
          version: result.metadata.version as unknown as ScormVersion,
          entryPoint: result.metadata.entryPoint,
          manifestPath: result.metadata.manifestPath
        };
        
        // Store preview data
        setPreviewData(convertedMetadata);
        setIsValidated(true);
        
        // Notify parent component about the SCORM metadata
        if (onScormData) {
          onScormData(convertedMetadata);
        }
        
        // Notify parent component about the validated file
        if (onFileValidated) {
          onFileValidated(file, convertedMetadata);
        }
        
        // Continue with upload if not deferred
        if (!deferUpload) {
          await uploadFile(file);
        }
      } else {
        // Handle validation error
        const errorMessage = result.error || "Invalid SCORM package";
        setError(errorMessage);
        toast.error(`Validation error: ${errorMessage}`);
        
        if (onValidationError) {
          onValidationError(errorMessage);
        }
        
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        setSelectedFile(null);
      }
    } catch (error: any) {
      // Handle unexpected errors
      const errorMessage = error.message || "Failed to process SCORM package";
      setError(errorMessage);
      toast.error(`Error: ${errorMessage}`);
      
      if (onValidationError) {
        onValidationError(errorMessage);
      }
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setSelectedFile(null);
    } finally {
      setIsValidating(false);
    }
  };
  
  // Handle file upload after validation - can be called externally
  const uploadFile = async (file: File = selectedFile!) => {
    if (!file) {
      toast.error("No file selected");
      return;
    }
    
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      // Upload the file using uploadthing
      await startUpload([file]);
    } catch (error: any) {
      // Error handling is done in the hook callbacks
      console.error("Upload error:", error);
    }
  };
  
  // Expose methods to parent through ref
  useImperativeHandle(ref, () => ({
    uploadFile
  }));
  
  // Reset the component state
  const handleReset = () => {
    setSelectedFile(null);
    setUploadedUrl(null);
    setIsValidated(false);
    setError(null);
    setPreviewData(null);
    setUploadProgress(0);
    onChange(undefined);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Error display */}
      {error && (
        <div className="bg-red-50 p-4 rounded-md flex items-start gap-x-2 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}
      
      {/* File upload area */}
      {!uploadedUrl && !isDisabled ? (
        <div 
          className={`border-2 border-dashed rounded-md p-6 transition-colors ${
            isValidating || isUploading 
              ? "border-slate-400 bg-slate-50" 
              : isValidated && deferUpload
                ? "border-green-300 bg-green-50"
                : "border-slate-300 hover:border-slate-400"
          }`}
        >
          <div className="flex flex-col items-center justify-center space-y-4">
            {isValidating ? (
              <>
                <Loader2 className="h-10 w-10 text-slate-500 animate-spin" />
                <p className="text-sm text-slate-500">Validating SCORM package...</p>
              </>
            ) : isUploading ? (
              <>
                <Loader2 className="h-10 w-10 text-slate-500 animate-spin" />
                <p className="text-sm text-slate-500">Uploading SCORM package...</p>
                {selectedFile && (
                  <p className="text-xs text-slate-400">
                    Uploading {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </p>
                )}
                
                {/* Upload progress bar */}
                <div className="w-full space-y-1">
                  <Progress value={uploadProgress} className="h-2" />
                  <p className="text-xs text-slate-500 text-right">{uploadProgress}%</p>
                </div>
              </>
            ) : isValidated && deferUpload ? (
              <>
                <FileArchive className="h-10 w-10 text-emerald-500" />
                <p className="text-sm font-medium text-slate-800">SCORM package validated</p>
                {selectedFile && (
                  <p className="text-xs text-slate-400">
                    {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </p>
                )}
                <Button 
                  onClick={() => handleReset()}
                  variant="outline" 
                  type="button"
                  size="sm"
                >
                  <X className="h-4 w-4 mr-2" />
                  Change
                </Button>
              </>
            ) : (
              <>
                <Upload className="h-10 w-10 text-slate-500" />
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-slate-800">
                    Drop your SCORM package here, or click to browse
                  </p>
                  <p className="text-xs text-slate-500">
                    SCORM .zip files up to 512MB
                  </p>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  accept=".zip"
                  onChange={handleFileChange}
                  disabled={isDisabled || isValidating || isUploading}
                />
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-md p-6 space-y-2">
          <FileArchive className="h-10 w-10 text-emerald-500" />
          <p className="text-sm text-slate-800 font-medium">SCORM package uploaded</p>
          
          {/* Preview information */}
          {previewData && (
            <div className="w-full bg-slate-50 p-3 rounded-md mt-2">
              <p className="text-sm font-medium">Package details:</p>
              <p className="text-xs text-slate-600">
                <span className="font-medium">Title:</span> {previewData.title}
              </p>
              {previewData.description && (
                <p className="text-xs text-slate-600 line-clamp-2">
                  <span className="font-medium">Description:</span> {previewData.description}
                </p>
              )}
              <p className="text-xs text-slate-600">
                <span className="font-medium">SCORM Version:</span> {previewData.version}
              </p>
            </div>
          )}
          
          {/* Change button */}
          {!isDisabled && (
            <Button
              onClick={handleReset}
              variant="outline"
              size="sm"
              className="mt-3"
            >
              <X className="h-4 w-4 mr-2" />
              Change
            </Button>
          )}
        </div>
      )}
    </div>
  );
});

ScormUpload.displayName = "ScormUpload";

// Create a custom hook to expose the upload functionality
export function useScormUploader() {
  const ref = useRef<ScormUploadHandle>(null);

  return {
    ref,
    uploadFile: (file?: File) => {
      if (ref.current) {
        return ref.current.uploadFile(file);
      }
      return Promise.reject(new Error("ScormUpload component reference not available"));
    }
  };
} 