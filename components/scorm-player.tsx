"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ScormVersion } from "@prisma/client";
import { ClientScormRenderer } from "./client-scorm-renderer";
import { Loader2 } from "lucide-react";

export interface ScormPlayerProps {
  userId: string;
  scormUrl: string;
  scormVersion: ScormVersion;
  courseId: string;
  onDataChange?: (data: any) => void;
}

export const ScormPlayer = ({
  userId,
  scormUrl,
  scormVersion,
  courseId,
  onDataChange,
}: ScormPlayerProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const lastLoadedUrl = useRef<string | null>(null);
  
  // New state for client-side extraction
  const [useClientSide, setUseClientSide] = useState(true);
  const [extractionProgress, setExtractionProgress] = useState(0);

  // Use a reference to track whether the component is mounted
  const isMounted = useRef(true);

  // Use refs to track current state values to avoid stale closures
  const currentScormUrl = useRef(scormUrl);
  const currentUseClientSide = useRef(useClientSide);
  
  // Update refs when props or state change
  useEffect(() => {
    currentScormUrl.current = scormUrl;
  }, [scormUrl]);
  
  useEffect(() => {
    currentUseClientSide.current = useClientSide;
  }, [useClientSide]);

  // Effect to handle URL changes and trigger content loading (server-side fallback method)
  useEffect(() => {
    // Skip if we're using client-side extraction
    if (useClientSide) return;
    
    // If the URL hasn't changed, don't reload
    if (lastLoadedUrl.current === scormUrl) {
      return;
    }

    // Set transition state if we're switching between SCOs
    if (lastLoadedUrl.current && scormUrl !== lastLoadedUrl.current) {
      setIsTransitioning(true);
    }

    lastLoadedUrl.current = scormUrl;
    
    const loadScorm = async () => {
      try {
        if (!isMounted.current) return;
        
        setIsLoading(true);
        
        // Only set the src if the iframe is available and we have a valid URL
        if (iframeRef.current && scormUrl && courseId) {
          // Check if this is a direct SCO URL or needs extraction
          const isScoUrl = scormUrl.startsWith('/scorm-content/');
          
          if (isScoUrl) {
            // Direct navigation to a specific SCO
            console.log("Loading specific SCO content from:", scormUrl);
            iframeRef.current.src = scormUrl;
          } else {
            // Initial load - extract the package first
            const extractUrl = `/api/courses/${courseId}/scorm-package/extract?url=${encodeURIComponent(scormUrl)}`;
            console.log("Loading SCORM content from:", extractUrl);
            iframeRef.current.src = extractUrl;
          }
        }
      } catch (err) {
        console.error("Error loading SCORM content:", err);
        if (isMounted.current) {
          setError("Failed to load SCORM content. Please try again later.");
          setIsLoading(false);
          setIsTransitioning(false);
        }
      }
    };

    loadScorm();

    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted.current = false;
    };
  }, [scormUrl, courseId, useClientSide]);

  // Handle iframe load event (for server-side fallback)
  const handleIframeLoad = useCallback(() => {
    // Skip if we're using client-side extraction
    if (currentUseClientSide.current) return;
    
    console.log("SCORM iframe loaded");
    if (isMounted.current) {
      setIsLoading(false);
      setIsTransitioning(false);
      setIframeLoaded(true);
      
      // Attempt to communicate with the SCORM API in the iframe
      const tryConnectToScormApi = () => {
        try {
          if (iframeRef.current && iframeRef.current.contentWindow) {
            // Future SCORM API communication can be implemented here
            console.log("Connected to iframe content window");
          }
        } catch (err) {
          console.error("Error connecting to SCORM API:", err);
        }
      };
      
      // Give the content a moment to initialize before trying to connect
      setTimeout(tryConnectToScormApi, 500);
    }
  }, []);

  // Set up the iframe load handler only once when the component mounts (for server-side fallback)
  useEffect(() => {
    // Skip if we're using client-side extraction
    if (useClientSide) return;
    
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.onload = handleIframeLoad;
    }

    return () => {
      if (iframe) {
        iframe.onload = null;
      }
    };
  }, [handleIframeLoad, useClientSide]);
  
  // Callbacks for ClientScormRenderer
  const handleClientSideLoad = useCallback((manifest: any) => {
    console.log("Client-side SCORM extraction successful:", manifest);
    if (isMounted.current) {
      setIsLoading(false);
      setIsTransitioning(false);
      
      // Set a timeout to ensure the iframe has actually rendered content
      setTimeout(() => {
        if (isMounted.current) {
          setIframeLoaded(true);
        }
      }, 500);
    }
  }, []);
  
  const handleClientSideError = useCallback((err: Error) => {
    console.error("Client-side extraction failed, falling back to server-side:", err);
    if (isMounted.current) {
      // Only fall back to server-side if we're in a browser environment
      if (typeof window !== 'undefined') {
        console.log("Attempting server-side fallback for SCORM extraction");
        setUseClientSide(false);
        setError(null); // Clear error to allow fallback to proceed
      } else {
        // If we can't fall back, show the error
        setError(`Failed to extract SCORM package: ${err.message}`);
        setIsLoading(false);
      }
    }
  }, []);
  
  const handleExtractionProgress = useCallback((progress: number) => {
    if (isMounted.current && progress !== extractionProgress) {
      setExtractionProgress(progress);
    }
  }, [extractionProgress]);

  // Check if we have a valid URL
  useEffect(() => {
    if (!scormUrl) {
      console.error("ScormPlayer: No SCORM URL provided");
      setError("No SCORM content URL provided");
      setIsLoading(false);
    } else {
      console.log("ScormPlayer received scormUrl:", scormUrl);
      // Clear error if we now have a URL
      if (error === "No SCORM content URL provided") {
        setError(null);
        setIsLoading(true); // Reset loading state
      }
    }
  }, [scormUrl, error]);

  // Determine if direct navigation to a SCO (for client-side rendering)
  const itemPath = scormUrl.startsWith('/scorm-content/') ? scormUrl.split('/').pop() : undefined;
  
  // Memoize the ClientScormRenderer to prevent unnecessary re-renders
  const memoizedClientRenderer = useCallback(() => (
    <ClientScormRenderer
      scormUrl={scormUrl}
      courseId={courseId}
      itemPath={itemPath}
      onLoad={handleClientSideLoad}
      onError={handleClientSideError}
      onProgress={handleExtractionProgress}
    />
  ), [scormUrl, courseId, itemPath, handleClientSideLoad, handleClientSideError, handleExtractionProgress]);
  
  // Function to handle SCORM data changes and communicate with the server
  const handleDataChange = useCallback((data: any) => {
    if (!onDataChange || !isMounted.current) return;
    
    try {
      // Pass data to parent component
      onDataChange(data);
    } catch (err) {
      console.error("Error handling SCORM data change:", err);
    }
  }, [onDataChange]);
  
  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  return (
    <div className="relative h-full w-full bg-black">
      {useClientSide ? (
        // Client-side extraction and rendering
        memoizedClientRenderer()
      ) : (
        // Server-side extraction fallback
        <>
      {(isLoading || isTransitioning) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 z-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3498db] border-t-transparent"></div>
          <p className="mt-4 text-sm text-slate-600">
            {isTransitioning ? "Navigating to content..." : "Loading content..."}
          </p>
        </div>
      )}
      {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 z-10">
              <p className="text-center text-sm text-red-500 max-w-md mx-auto">{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Try Again
              </button>
        </div>
      )}
      <iframe
        ref={iframeRef}
        className="h-full w-full border-0"
        title="SCORM Content"
        allowFullScreen
      />
        </>
      )}
    </div>
  );
}; 