"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { 
  downloadAndExtractScorm, 
  extractScormFromFile, 
  createFileObjectURL, 
  revokeAllObjectURLs,
  ExtractedScormPackage
} from "@/lib/client/scorm-extractor";
import { getScormPackage, storeScormPackage } from "@/lib/client/scorm-cache";
import { Loader2 } from "lucide-react";

interface ClientScormRendererProps {
  /**
   * URL of the SCORM package to render
   */
  scormUrl: string;
  
  /**
   * Unique identifier for the course (used for caching)
   */
  courseId: string;
  
  /**
   * File object if directly uploading a SCORM package
   */
  scormFile?: File;
  
  /**
   * Optional specific item path to navigate to within the SCORM package
   */
  itemPath?: string;
  
  /**
   * Called when the SCORM content is successfully loaded
   */
  onLoad?: (manifest: any) => void;
  
  /**
   * Called when an error occurs during loading or rendering
   */
  onError?: (error: Error) => void;
  
  /**
   * Called when extraction progress updates
   */
  onProgress?: (progress: number) => void;
}

/**
 * ClientScormRenderer component that handles extraction, caching, and rendering of SCORM packages
 */
export function ClientScormRenderer({ 
  scormUrl, 
  courseId, 
  scormFile, 
  itemPath,
  onLoad, 
  onError,
  onProgress 
}: ClientScormRendererProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [contentUrl, setContentUrl] = useState<string | null>(null);
  const [extractedPackage, setExtractedPackage] = useState<ExtractedScormPackage | null>(null);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const isMounted = useRef(true);
  
  // Track current values to avoid stale closures
  const currentExtractedPackage = useRef<ExtractedScormPackage | null>(null);
  
  // Update ref when extracted package changes
  useEffect(() => {
    currentExtractedPackage.current = extractedPackage;
  }, [extractedPackage]);

  // Generate a cache key from the URL and courseId
  const cacheKey = useCallback(() => {
    return `scorm-${courseId}-${encodeURIComponent(scormUrl)}`;
  }, [courseId, scormUrl]);
  
  // Clean up object URLs to prevent memory leaks
  const cleanupObjectURLs = useCallback(() => {
    objectUrlsRef.current.forEach(url => {
      URL.revokeObjectURL(url);
    });
    objectUrlsRef.current = [];
  }, []);
  
  // Create and track object URLs
  const createAndTrackObjectURL = useCallback(async (packageData: ExtractedScormPackage, filePath: string) => {
    // Clean up existing URLs first to prevent memory leaks
    cleanupObjectURLs();
    
    try {
      const url = await createFileObjectURL(packageData, filePath);
      if (url) {
        objectUrlsRef.current.push(url);
      }
      return url;
    } catch (error) {
      console.error("Error creating object URL:", error);
      return null;
    }
  }, [cleanupObjectURLs]);

  // Handle progress updates during extraction
  const handleProgress = useCallback((progress: number) => {
    if (!isMounted.current) return;
    
    if (progress !== extractionProgress) {
      setExtractionProgress(progress);
      if (onProgress) {
        onProgress(progress);
      }
    }
  }, [extractionProgress, onProgress]);

  // Extract SCORM package from URL or file and prepare for rendering
  const extractAndRenderScorm = useCallback(async () => {
    if (!isMounted.current) return;
    
    // Handle empty URL
    if (!scormFile && (!scormUrl || scormUrl.trim() === "")) {
      console.error("ClientScormRenderer: No SCORM URL or file provided");
      setError(new Error("No SCORM content source provided"));
      setIsLoading(false);
      return;
    }
    
    const key = cacheKey();
    
    try {
      setIsLoading(true);
      setError(null);
      
      // First, try to get from cache
      const cachedPackage = await getScormPackage(key);
      
      let packageData: ExtractedScormPackage;
      
      if (cachedPackage) {
        console.log("Using cached SCORM package");
        packageData = cachedPackage;
      } else {
        console.log("Extracting SCORM package");
        
        if (scormFile) {
          // Extract from file
          console.log("Extracting from file:", scormFile.name, "size:", scormFile.size, "type:", scormFile.type);
          packageData = await extractScormFromFile(scormFile, handleProgress);
        } else {
          // Download and extract from URL
          console.log("Downloading and extracting from URL:", scormUrl);
          packageData = await downloadAndExtractScorm(scormUrl, handleProgress);
        }
        
        // Store in cache for future use
        await storeScormPackage(key, packageData);
      }
      
      if (!isMounted.current) return;
      
      // Store the extracted package for later use (e.g., navigation)
      setExtractedPackage(packageData);
      
      // Determine which content to display
      let contentFilePath = itemPath || packageData.manifest.entryPoint;
      
      if (!contentFilePath) {
        throw new Error("Could not determine entry point for SCORM package");
      }
      
      console.log("Using content file path:", contentFilePath);
      
      // Create object URL for the content
      const url = await createAndTrackObjectURL(packageData, contentFilePath);
      
      if (!url) {
        throw new Error(`Content file '${contentFilePath}' not found in package`);
      }
      
      console.log("Created object URL for content:", url);
      
      // Set the URL for the iframe
      setContentUrl(url);
      
      // Important: Set loading to false AFTER content URL is set
      setIsLoading(false);
      
      // Call onLoad handler if provided
      if (onLoad) {
        onLoad(packageData.manifest);
      }
    } catch (err) {
      console.error("Error extracting SCORM package:", err);
      if (!isMounted.current) return;
      
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setIsLoading(false); // Ensure loading state is cleared on error
      if (onError) {
        onError(error);
      }
    }
  }, [scormUrl, scormFile, itemPath, cacheKey, handleProgress, createAndTrackObjectURL, onLoad, onError]);

  // Effect to load the SCORM content when component mounts or URL changes
  useEffect(() => {
    isMounted.current = true;
    
    // Only attempt extraction if we have a valid URL or file and we're not already loading
    if ((scormUrl || scormFile) && !contentUrl) {
      extractAndRenderScorm();
    } else if (!scormUrl && !scormFile) {
      // Just set loading state if no URL/file yet
      setIsLoading(true);
      console.log("Waiting for valid SCORM URL or file");
    }
    
    // Clean up when the component unmounts or URL changes
    return () => {
      isMounted.current = false;
      cleanupObjectURLs();
      if (currentExtractedPackage.current) {
        revokeAllObjectURLs(currentExtractedPackage.current);
      }
    };
  }, [extractAndRenderScorm, cleanupObjectURLs, scormUrl, scormFile, contentUrl]);

  // Navigate to a different item within the SCORM package
  const navigateToItem = useCallback(async (newItemPath: string) => {
    if (!currentExtractedPackage.current || !isMounted.current) {
      console.error("Cannot navigate: No SCORM package extracted");
      return;
    }
    
    // Clean up existing object URLs
    cleanupObjectURLs();
    
    // Create object URL for the new content
    const url = await createAndTrackObjectURL(currentExtractedPackage.current, newItemPath);
    
    if (!url) {
      const error = new Error(`Content file '${newItemPath}' not found in package`);
      setError(error);
      if (onError) {
        onError(error);
      }
      return;
    }
    
    // Update the content URL
    setContentUrl(url);
  }, [cleanupObjectURLs, createAndTrackObjectURL, onError]);

  return (
    <div className="relative h-full w-full">
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 z-10">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="mt-4 text-sm text-slate-600">
            {extractionProgress > 0 && extractionProgress < 1
              ? `Extracting content... ${Math.round(extractionProgress * 100)}%`
              : "Loading..."}
          </p>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-10">
          <p className="text-center text-sm text-red-500">{error.message}</p>
        </div>
      )}
      
      {contentUrl && !isLoading && (
        <iframe
          ref={iframeRef}
          src={contentUrl}
          className="h-full w-full border-0"
          title="SCORM Content"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation allow-modals allow-downloads allow-pointer-lock"
        />
      )}
    </div>
  );
} 