"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  Component,
  ErrorInfo,
  ReactNode,
} from "react";
import { 
  registerScormServiceWorker,
  extractAndWaitForCompletion,
  hasActiveServiceWorkerController,
  isServiceWorkerSupported,
  getScormFileUrl,
  isScormPackageCached,
  ProgressInfo as SWProgressInfo,
  ScormExtractionResult,
  isExtractionInProgress,
  cancelExtraction
} from "@/lib/client/service-worker-registry";
import scormApi, {
  ScormVersion,
  ScormApiEvent,
  Scorm2004NavigationCommand,
} from "@/lib/client/scorm-api";
import { cn } from "@/lib/utils";
import { Loader2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScormManifest, ScormItem, ScormResource } from "@/lib/scorm";
import {
  findItemById,
  findNextItem,
  findPreviousItem,
  isNavigationAllowed,
} from "@/lib/client/scorm-manifest-parser";
import { ExtractedScormPackage } from "@/lib/client/scorm-extractor";
import { getScormPackage } from "@/lib/client/scorm-cache";
import { usePackageProgress } from "@/lib/client/stores/use-scorm-progress";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

interface ScormPreviewProps {
  /**
   * URL of the SCORM package to render
   */
  packageUrl: string;
  
  /**
   * SCORM version (1.2 or 2004)
   */
  scormVersion?: ScormVersion;
  
  /**
   * Unique identifier for the package (used for caching)
   */
  packageKey?: string;
  
  /**
   * File object if directly uploading a SCORM package
   */
  packageFile?: File;
  
  /**
   * Optional specific item path to navigate to within the SCORM package
   */
  itemPath?: string;
  
  /**
   * LMS commit URL for sending SCORM data to the server
   */
  lmsCommitUrl?: string;
  
  /**
   * LMS get data URL for retrieving SCORM data from the server
   */
  lmsGetDataUrl?: string;
  
  /**
   * Called when the SCORM content is successfully loaded
   */
  onLoad?: () => void;
  
  /**
   * Called when an error occurs during loading or rendering
   */
  onError?: (error: Error) => void;
  
  /**
   * Called when the SCORM data changes (for integration with our tracking system)
   */
  onDataChange?: (key: string, value: any) => void;
  
  /**
   * Called when extraction progress updates
   */
  onProgress?: (progress: number) => void;
  
  /**
   * Time in ms between automatic commits (defaults to 30000ms)
   */
  autoCommitSeconds?: number;

  /**
   * CSS class name for the container
   */
  className?: string;
  
  /**
   * Called when a SCORM package has been extracted
   */
  onPackageExtracted?: (packageData: ExtractedScormPackage) => void;
}

// Define a more specific SequencingEvent type to handle the additional properties
interface ScormSequencingEvent {
  type: ScormApiEvent;
  key?: string;
  value?: any;
  error?: any;
  result?: any;
  command?: Scorm2004NavigationCommand;
  targetId?: string;
}

// Define specific types for the two different formats of SCORM objects we might receive
interface ScormObjectFormat1 {
  version: string;
  organizations: Record<string, { title: string; items: ScormItem[] }>;
  resources: Record<string, ScormResource>;
  defaultOrganizationIdentifier?: string;
  entryPoint?: string;
  metadata?: any;
}

interface ScormObjectFormat2 {
  version: string;
  resources: any[];
  PREFIX?: string;
}

// Define a type for the extraction result
interface LocalScormExtractionResult {
  success: boolean;
  error?: string;
  scormObj?: unknown; // Use unknown to allow for type assertions
}

// The complete expected format with all optional properties
interface ScormManifestPartial {
  version: string;
  organizations?: Record<string, { title: string; items: ScormItem[] }>;
  resources?: Record<string, ScormResource>;
  defaultOrganizationIdentifier?: string;
  entryPoint?: string;
  metadata?: {
    schema?: string;
    schemaversion?: string;
    title?: string;
    description?: string;
    keywords?: string[];
    language?: string;
  };
}

// The alternative format we sometimes receive with an array of resources
interface ScormManifestWithArrayResources {
  version: string;
  resources: Array<any>; // Array format
  PREFIX?: string;
}

/**
 * Enhanced progress information from the service worker
 */
interface ProgressInfo {
  progress: number;
  stage?: string;
  status?: string;
  totalSize?: number;
  processedFiles?: number;
  fileCount?: number;
  elapsedTime?: number;
}

// Interface for tracking progress updates over time
interface ProgressUpdate {
  time: number; 
  value: number; 
  stage?: string;
}

/**
 * Loading indicator for SCORM content
 */
function ScormLoadingIndicator({
  progress,
  stage,
  processedFiles,
  fileCount,
  totalSize,
  elapsedTime,
}: {
  progress: number;
  stage?: string;
  processedFiles?: number;
  fileCount?: number;
  totalSize?: number;
  elapsedTime?: number;
}) {
  // State for client-side rendering of time to prevent hydration errors
  const [currentTime, setCurrentTime] = useState<string>("");

  // Update time only on client side
  useEffect(() => {
    setCurrentTime(new Date().toLocaleTimeString());
  }, []);

  // Calculate a percentage for display, ensure it's between 0-100
  const percentage = Math.min(Math.max(progress * 100, 0), 100);

  // Format stage text for display
  const getStageText = useCallback(() => {
    if (!stage) return "";

    switch (stage.toLowerCase()) {
      case "download":
      case "downloading":
        return "Downloading";
      case "processing":
        return "Processing";
      case "extract":
      case "extracting":
        return "Extracting";
      case "complete":
        return "Finalizing";
      default:
        return stage.charAt(0).toUpperCase() + stage.slice(1);
    }
  }, [stage]);

  // Get appropriate icon for current stage
  const getStageIcon = useCallback(() => {
    if (!stage)
      return <Loader2 className="w-12 h-12 animate-spin mb-4 text-primary" />;

    const stageKey = stage.toLowerCase();

    if (stageKey === "downloading" || stageKey === "download") {
      return (
        <div className="w-12 h-12 mb-4 flex items-center justify-center">
            <svg
            className="animate-bounce text-primary"
              fill="none"
            height="24"
              stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
              viewBox="0 0 24 24"
            width="24"
              xmlns="http://www.w3.org/2000/svg"
            >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
            </svg>
        </div>
      );
    }

    if (stageKey === "processing") {
      return <Loader2 className="w-12 h-12 animate-spin mb-4 text-primary" />;
    }

    if (stageKey === "extract" || stageKey === "extracting") {
      return (
        <div className="w-12 h-12 mb-4 flex items-center justify-center">
            <svg
            className="animate-spin text-primary"
              fill="none"
            height="24"
              stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
              viewBox="0 0 24 24"
            width="24"
              xmlns="http://www.w3.org/2000/svg"
            >
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
            </svg>
        </div>
      );
    }

    if (stageKey === "complete") {
      return (
        <div className="w-12 h-12 mb-4 flex items-center justify-center text-green-500 dark:text-green-400">
            <svg
              fill="none"
            height="24"
              stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
              viewBox="0 0 24 24"
            width="24"
              xmlns="http://www.w3.org/2000/svg"
            >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
        </div>
      );
    }

    return <Loader2 className="w-12 h-12 animate-spin mb-4 text-primary" />;
  }, [stage]);

  // Get appropriate message based on stage and progress
  const getMessage = useCallback(() => {
    if (!stage) return `${Math.round(percentage)}% Complete`;
    
    // More specific messages based on stage
    const stageText = getStageText();
    
    if (stage.toLowerCase() === "complete" || percentage >= 99.5) {
      return "Preparing content...";
    }
    
    return `${stageText}: ${Math.round(percentage)}% Complete`;
  }, [percentage, stage, getStageText]);

  // Determine progress bar color based on stage
  const getProgressBarColor = useCallback(() => {
    if (!stage) return "bg-primary";

    const stageKey = stage.toLowerCase();

    if (stageKey === "downloading" || stageKey === "download") {
      return "bg-primary";
    }

    if (stageKey === "processing") {
      return "bg-primary";
    }

    if (stageKey === "complete") {
      return "bg-green-500 dark:bg-green-400";
    }

    if (stageKey === "extract" || stageKey === "extracting") {
      return "bg-primary";
    }

    return "bg-primary";
  }, [stage]);

  // Format file size for display
  const formatSize = useCallback((bytes?: number) => {
    if (bytes === undefined) return "";
    
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
  }, []);

  // Format elapsed time for display
  const formatElapsedTime = useCallback(() => {
    if (!elapsedTime) return "";

    const seconds = Math.floor(elapsedTime / 1000);

    if (seconds >= 60) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes}m ${seconds % 60}s`;
    }

    return `${seconds}s`;
  }, [elapsedTime]);

  // Get estimated time remaining (if enough information is available)
  const getEstimatedTimeRemaining = useCallback(() => {
    // Returning null to disable time remaining calculation as requested
    return null;
  }, []);

  // Get progress steps visualization
  const renderProgressSteps = useCallback(() => {
    const steps = [
      { key: "downloading", label: "Download" },
      { key: "processing", label: "Process" },
      { key: "extracting", label: "Extract" },
      { key: "complete", label: "Complete" },
    ];

    // Determine current step
    let currentStepIndex = 0;
    if (stage) {
      const stageKey = stage.toLowerCase();
      const matchedIndex = steps.findIndex((s) => stageKey.includes(s.key));
      if (matchedIndex >= 0) {
        currentStepIndex = matchedIndex;
      }
    }

    return (
      <div className="flex items-center justify-between w-full mt-1 mb-3">
        {steps.map((step, index) => {
          // Calculate if this step is active, completed, or upcoming
          const isActive = index === currentStepIndex;
          const isCompleted =
            index < currentStepIndex || (index === 3 && progress >= 0.99);

          return (
            <div key={step.key} className="flex flex-col items-center">
              <div
                className={`
                  w-4 h-4 rounded-full mb-1
                  ${
                    isActive
                      ? "bg-primary ring-2 ring-primary-200"
                      : isCompleted
                      ? "bg-green-500 dark:bg-green-400"
                      : "bg-gray-200"
                  }
                `}
              />
              <span
                className={`text-xs ${
                  isActive
                    ? "text-primary font-medium"
                    : isCompleted
                    ? "text-green-500 dark:text-green-400"
                    : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  }, [stage, progress]);

  const estimatedRemaining = getEstimatedTimeRemaining();

  // Memoize components for performance
  const memoizedIcon = useMemo(() => getStageIcon(), [getStageIcon]);
  const memoizedMessage = useMemo(() => getMessage(), [getMessage]);
  const memoizedFileProgress = useMemo(() => {
    if (processedFiles !== undefined && fileCount !== undefined) {
      return `${processedFiles} / ${fileCount} files`;
    }
    return "";
  }, [processedFiles, fileCount]);
  const memoizedElapsedTime = useMemo(() => formatElapsedTime(), [formatElapsedTime]);
  const memoizedSize = useMemo(() => formatSize(totalSize), [formatSize, totalSize]);
  
  // Get the color for the progress bar
  const progressBarColor = useMemo(() => getProgressBarColor(), [getProgressBarColor]);

  // Debug information - only render on client side
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <Card className="w-[350px] max-w-[90vw] bg-card/80 backdrop-blur-sm shadow-lg border-border overflow-hidden">
      <div className="flex flex-col items-center justify-center p-6">
        {/* Icon */}
        {memoizedIcon}
        
        {/* Progress percentage */}
        <p className="text-sm font-medium text-foreground transition-all duration-300 ease-out">
          {memoizedMessage}
        </p>

      {/* Progress bar */}
        <div className="w-full mt-4 space-y-2">
          <Progress 
            value={percentage} 
            className="h-2 transition-all duration-300" 
            indicatorClassName={progressBarColor}
          />
          
          {/* File progress if available */}
          {processedFiles !== undefined && fileCount !== undefined && (
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>{memoizedFileProgress}</span>
              {totalSize && <span>{memoizedSize}</span>}
            </div>
          )}
          
          {/* Elapsed time */}
          {elapsedTime && (
            <div className="flex justify-end text-xs text-muted-foreground">
              <span>Time: {memoizedElapsedTime}</span>
        </div>
      )}
    </div>
      </div>
    </Card>
  );
}

/**
 * Error display component for SCORM content
 */
function ScormErrorDisplay({
  error,
  onRetry,
  isRetrying,
  isApiError = false,
  onForceRetry,
}: {
  error: Error;
  onRetry?: () => void;
  isRetrying?: boolean;
  isApiError?: boolean;
  onForceRetry?: () => void;
}) {
  return (
    <Card className="w-[350px] max-w-[90vw] bg-card/80 backdrop-blur-sm shadow-lg border-border overflow-hidden">
      <div className="flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 mb-4 flex items-center justify-center text-destructive">
          <AlertTriangle className="h-10 w-10" />
      </div>
        
        <h3 className="text-lg font-semibold text-foreground mb-2">
          {isApiError ? "SCORM API Error" : "Loading Error"}
        </h3>
        
        <p className="text-sm text-muted-foreground text-center mb-4">
        {error.message}
      </p>
      
        <div className="flex gap-2">
        {onRetry && (
            <Button 
            onClick={onRetry}
            disabled={isRetrying}
              className="min-w-[100px]"
            >
              {isRetrying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Retrying...
                </>
              ) : (
                "Try Again"
              )}
            </Button>
          )}
          
          {isApiError && onForceRetry && (
            <Button 
              variant="outline" 
            onClick={onForceRetry}
              className="min-w-[100px]"
          >
              Force Reload
            </Button>
        )}
      </div>
    </div>
    </Card>
  );
}

// Error boundary to catch errors in SCORM content loading
class ScormErrorBoundary extends Component<
  { children: ReactNode; onError: (error: Error) => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onError: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("SCORM error boundary caught error:", error, errorInfo);
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return null; // Parent component will show the error UI
    }

    return this.props.children;
  }
}

/**
 * ScormPreview component for displaying SCORM content
 * This component integrates our service worker for package extraction and caching
 * with the SCORM API for content interaction
 */
export function ScormPreview({ 
  packageUrl,
  scormVersion = ScormVersion.SCORM_12,
  packageKey,
  packageFile,
  itemPath,
  lmsCommitUrl,
  lmsGetDataUrl,
  onLoad,
  onError,
  onDataChange,
  onProgress,
  autoCommitSeconds = 30,
  className,
  onPackageExtracted,
}: ScormPreviewProps) {
  // Create a stable component instance ID for the iframe key
  const stableComponentId = useRef(`scorm-iframe-${Math.random().toString(36).substring(2, 9)}`);
  
  // State for the iframe content URL
  const [contentUrl, setContentUrl] = useState<string>("");

  // State for loading and extraction progress
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingError, setLoadingError] = useState<Error | null>(null);
  
  // Reference for the package key to use with progress store
  const actualPackageKey = useRef<string>("");

  // Handler for errors
  const handleError = useCallback((error: Error) => {
    console.log("SCORM content error caught by boundary:", error);
    setLoadingError(error);
    setIsLoading(false);
    if (onError) {
      onError(error);
    }
  }, [onError]);

  // Get progress information from the shared store
  const progressInfo = usePackageProgress(actualPackageKey.current);
  
  // For backward compatibility, maintain some local state
  const [progressUpdates, setProgressUpdates] = useState<Array<{
    time: number;
    value: number;
    stage?: string;
  }>>([]);
  
  // Track the last displayed progress to reduce unnecessary updates
  const lastDisplayedProgress = useRef<number>(0);
  const PROGRESS_UPDATE_THRESHOLD = 0.02; // Only update on 2% or greater changes
  
  // Add smooth progress animation
  const [displayedProgress, setDisplayedProgress] = useState<number>(0);
  const targetProgress = useRef<number>(0);
  const animationFrameId = useRef<number | null>(null);
  
  // Add stage transition smoothing
  const [displayedStage, setDisplayedStage] = useState<string>("");
  const stageTransitionTimeout = useRef<NodeJS.Timeout | null>(null);
  const STAGE_TRANSITION_DELAY = 300; // ms to wait before showing new stage

  // Effect to smoothly animate progress
  useEffect(() => {
    // Get progress from store or updates
    const latestProgress = progressInfo?.progress ?? 
      (progressUpdates.length > 0 ? progressUpdates[progressUpdates.length - 1].value : 0);
    
    // Set as target (but never go backwards)
    if (latestProgress > targetProgress.current) {
      targetProgress.current = latestProgress;
    }
    
    // Animation function
    const animateProgress = () => {
      setDisplayedProgress(current => {
        const diff = targetProgress.current - current;
        // If difference is tiny, snap to target
        if (Math.abs(diff) < 0.002) return targetProgress.current;
        // Otherwise move a fraction of the way there (easing)
        return current + (diff * 0.08); // Adjust this factor to control animation speed
      });
      
      // Continue animation if not at target
      if (Math.abs(displayedProgress - targetProgress.current) > 0.002) {
        animationFrameId.current = requestAnimationFrame(animateProgress);
      }
    };
    
    // Start animation
    if (!animationFrameId.current) {
      animationFrameId.current = requestAnimationFrame(animateProgress);
    }
    
    // Clean up
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, [progressInfo, progressUpdates, displayedProgress]);
  
  // Effect to smooth stage transitions
  useEffect(() => {
    // Get the latest stage
    const latestStage = progressInfo?.stage || "";
    
    // Only update if we have a stage and it's different from current
    if (latestStage && latestStage !== displayedStage) {
      // Clear any existing timeout
      if (stageTransitionTimeout.current) {
        clearTimeout(stageTransitionTimeout.current);
      }
      
      // Set a timeout to update the stage after a delay
      stageTransitionTimeout.current = setTimeout(() => {
        setDisplayedStage(latestStage);
        stageTransitionTimeout.current = null;
      }, STAGE_TRANSITION_DELAY);
    }
    
    return () => {
      if (stageTransitionTimeout.current) {
        clearTimeout(stageTransitionTimeout.current);
        stageTransitionTimeout.current = null;
      }
    };
  }, [progressInfo?.stage, displayedStage]);

  // State for SCORM data
  const [scormManifest, setScormManifest] = useState<ScormManifest | null>(
    null
  );
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [isScormApiInitialized, setIsScormApiInitialized] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  
  // Refs to track component mount state and package key
  const isMounted = useRef(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeDomMounted = useRef(false);
  const pendingUrl = useRef<string | null>(null);

  // Add retry state variables
  const [initializationAttempts, setInitializationAttempts] = useState(0);
  const maxInitAttempts = 3;
  const [isRetrying, setIsRetrying] = useState(false);
  
  // Tracking for auto-commit
  const commitIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Force iframe reload attempts counter
  const reloadAttempts = useRef(0);

  // Add a state to track client-side rendering
  const [isClient, setIsClient] = useState(false);
  
  // Add event listener refs for cleanup
  const eventListenersRef = useRef<{
    setValueHandler?: (event: { 
      type: ScormApiEvent;
      key?: string;
      value?: any;
      error?: any;
      result?: any;
    }) => void;
    sequencingHandler?: (event: { 
      type: ScormApiEvent;
      key?: string;
      value?: any;
      error?: any;
      result?: any;
      command?: Scorm2004NavigationCommand;
      targetId?: string;
    }) => void;
  }>({});

  // Effect to set client-side rendering state
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Create URL for content
  const createContentUrl = useCallback((path: string) => {
    if (!actualPackageKey.current) return "";
    return getScormFileUrl(actualPackageKey.current, path);
  }, []);

  // Effect to track when iframe is mounted in DOM
  useEffect(() => {
    // Function to check if iframe is mounted in the DOM
    const checkIframeMount = () => {
      if (iframeRef.current) {
        console.log("Iframe DOM element is now available");
        iframeDomMounted.current = true;

        // If we have a pending URL, set it now
        if (contentUrl) {
          console.log("Setting deferred src to:", contentUrl);
          iframeRef.current.src = contentUrl;
        }
      } else {
        // If not mounted yet, check again after a short delay
        setTimeout(checkIframeMount, 50);
      }
    };

    checkIframeMount();

    return () => {
      iframeDomMounted.current = false;
    };
  }, [contentUrl]);

  // Function to safely set iframe src
  const setIframeSrc = useCallback((url: string) => {
    if (!url) {
      console.warn("Attempted to set empty URL to iframe");
      return false;
    }

    console.log("Setting iframe src:", url);

    if (iframeRef.current && iframeDomMounted.current) {
      // Iframe is available, set src directly
      console.log("Iframe available, setting src directly");
      iframeRef.current.src = url;
      return true;
    } else {
      // Iframe not available yet, store for later
      console.log("Iframe not yet available, storing URL for later");
      pendingUrl.current = url;
      return false;
    }
  }, []);
  
  /**
   * Initialize the SCORM API when the iframe has loaded
   */
  const initializeScormApi = useCallback(async (forceRetry = false) => {
    if (!isMounted.current) {
      console.log("Component not mounted, skipping SCORM API initialization");
      return false;
    }

    console.log(`Loading SCORM API... (Attempt ${initializationAttempts + 1}/${maxInitAttempts})`);
    setIsRetrying(true);
    
    try {
      // Step 1: Ensure the SCORM API library is loaded and the API object is exposed in window
      console.log("Ensuring SCORM API library is loaded with version:", scormVersion);
      const scormLoaded = await scormApi.ensureScormLoaded(scormVersion);
      
      if (!scormLoaded) {
        console.error("Failed to load SCORM API library");
        setInitializationAttempts(prev => prev + 1);
        
        // Schedule a retry after a delay if under max attempts
        if (initializationAttempts < maxInitAttempts - 1) {
          console.log(`Will retry in 2 seconds (Attempt ${initializationAttempts + 1}/${maxInitAttempts})`);
          setTimeout(() => {
            if (isMounted.current) {
              initializeScormApi();
            }
          }, 2000);
        } else {
          if (onError) {
            onError(new Error("Failed to load SCORM API library after maximum attempts"));
          }
          setIsRetrying(false);
        }
        return false;
      }
      
      // Step 2: Initialize our API wrapper with the version from props
      console.log(`Using SCORM version from props: ${scormVersion}`);
      
      // Step 3: Initialize our SCORM API handler to setup event listeners
      // Note: The actual API initialization is done by the SCORM content itself
      const success = scormApi.initialize({
        version: scormVersion,
        autocommit: true,
        autocommitSeconds: autoCommitSeconds,
        lmsCommitUrl,
        lmsGetDataUrl,
        connectionInitialized: () => {
          console.log("SCORM API connection initialized");
        },
        connectionTerminated: () => {
          console.log("SCORM API connection terminated");
        },
        onLogMessage: (message, type) => {
          console.log(`SCORM: ${type} - ${message}`);
        },
      });
      
      console.log("SCORM API setup result:", success);
      
      // Debug check if the API is properly available in the window object
      if (scormVersion === ScormVersion.SCORM_12) {
        console.log("Checking if SCORM 1.2 API is available:", window.API ? "YES" : "NO");
      } else {
        console.log("Checking if SCORM 2004 API is available:", window.API_1484_11 ? "YES" : "NO");
      }
      
      if (success) {
        // Reset attempt counter
        setInitializationAttempts(0);
        setIsRetrying(false);
        setIsScormApiInitialized(true);
        
        // Clear any existing handlers to prevent duplication
        if (eventListenersRef.current.setValueHandler) {
          scormApi.removeEventListener(
            ScormApiEvent.LMSSetValue,
            eventListenersRef.current.setValueHandler
          );
        }
        
        // Set up event listener for SCORM API events
        const setValueHandler = (event: { 
          type: ScormApiEvent;
          key?: string;
          value?: any;
          error?: any;
          result?: any;
        }) => {
          if (onDataChange && event.key && event.value !== undefined) {
            console.log(`SCORM data change: ${event.key} = ${event.value}`);
            onDataChange(event.key, event.value);
          }
        };
        
        scormApi.addEventListener(ScormApiEvent.LMSSetValue, setValueHandler);
        
        // Store the handler for cleanup
        eventListenersRef.current.setValueHandler = setValueHandler;

        // Set up commit interval if auto-commit isn't enabled in the API
        if (autoCommitSeconds && autoCommitSeconds > 0) {
          // Clear any existing interval
          if (commitIntervalRef.current) {
            clearInterval(commitIntervalRef.current);
          }
          
          // Set up a new commit interval
          commitIntervalRef.current = setInterval(() => {
            if (isMounted.current && scormApi.isInitialized()) {
              console.log("Auto-committing SCORM data");
              scormApi.commit();
            }
          }, autoCommitSeconds * 1000);
        }

        console.log("SCORM API setup completed successfully");
        return true;
      } else {
        const errorCode = scormApi.getLastError();
        const errorString = scormApi.getErrorString();
        const errorDiagnostic = scormApi.getDiagnostic();
        
        const errorMessage = `Failed to setup SCORM API: Code ${errorCode} - ${errorString} (${errorDiagnostic})`;
        console.error(errorMessage);
        
        // Increment attempt counter
        setInitializationAttempts(prev => prev + 1);
        
        // Schedule a retry after a delay if under max attempts
        if (initializationAttempts < maxInitAttempts - 1) {
          console.log(`Will retry in 2 seconds (Attempt ${initializationAttempts + 1}/${maxInitAttempts})`);
          setTimeout(() => {
            if (isMounted.current) {
              initializeScormApi();
            }
          }, 2000);
          return false;
        } else {
          if (onError) {
            onError(new Error(errorMessage));
          }
          setIsRetrying(false);
          return false;
        }
      }
    } catch (error) {
      const errorMessage = `Error setting up SCORM API: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMessage, error);
      
      // Increment attempt counter
      setInitializationAttempts(prev => prev + 1);
      
      // Schedule a retry after a delay if under max attempts
      if (initializationAttempts < maxInitAttempts - 1) {
        console.log(`Will retry in 2 seconds (Attempt ${initializationAttempts + 1}/${maxInitAttempts})`);
        setTimeout(() => {
          if (isMounted.current) {
            initializeScormApi();
          }
        }, 2000);
      } else {
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
        setIsRetrying(false);
      }
      return false;
    }
  }, [
    scormVersion,
    autoCommitSeconds,
    lmsCommitUrl,
    lmsGetDataUrl,
    onDataChange,
    onError,
    initializationAttempts
  ]);
  
  /**
   * Handle iframe load event
   */
  const handleIframeLoad = useCallback(async () => {
    console.log("SCORM iframe load event triggered", {
      isMounted: isMounted.current,
      iframeReady,
      contentUrl,
      iframe: iframeRef.current ? "available" : "null",
      currentSrc: iframeRef.current?.src,
    });

    if (!isMounted.current) return;
    // Check if the iframe has actually loaded content
    let loadedProperly = false;

    try {
      // Try to access the iframe's contentWindow
      if (iframeRef.current && iframeRef.current.contentWindow) {
        // Check if we have access to the document (not blocked by CORS)
        // This will throw an error if cross-origin, which is actually good
        // as it means the iframe has loaded external content
        const doc = iframeRef.current.contentWindow.document;

        // If we get here without error, we can access the document
        // Check if it has content
        loadedProperly = !!doc && (!!doc.body || !!doc.documentElement);

        console.log("SCORM iframe load status:", {
          loadedProperly,
          hasBody: !!doc.body,
          bodyContent: doc.body ? doc.body.innerHTML.length > 0 : false,
        });
      }
    } catch (error) {
      // This is expected for cross-origin content and means it loaded
      console.log("Cross-origin content loaded (expected error):", error);
      loadedProperly = true;
    }

    if (loadedProperly) {
      console.log("SCORM iframe content loaded successfully");
    setIsLoading(false);
      setIframeReady(true);
    
    if (onLoad) {
      onLoad();
    }
    
    // Initialize the SCORM API if not already done
    if (!isScormApiInitialized) {
        console.log("Initializing SCORM API after iframe loaded");
        try {
          const initialized = await initializeScormApi();
          if (initialized) {
            console.log("SCORM API initialization completed successfully");
          } else {
            console.warn("SCORM API initialization failed");
          }
        } catch (err) {
          console.error("Error during SCORM API initialization:", err);
          if (onError) {
            onError(err instanceof Error ? err : new Error(String(err)));
          }
        }
      }
    } else {
      console.warn("SCORM iframe loaded but content may not be correct");

      // If we've made fewer than 3 attempts, try reloading the iframe
      if (reloadAttempts.current < 3) {
        reloadAttempts.current += 1;
        console.log(`Attempting iframe reload (${reloadAttempts.current}/3)`);

        // Force reload by updating iframe src with timestamp
        if (contentUrl) {
          const cacheBuster = `?reload=${Date.now()}`;
          const reloadUrl = contentUrl.includes("?")
            ? `${contentUrl}&reload=${Date.now()}`
            : `${contentUrl}${cacheBuster}`;

          setIframeSrc(reloadUrl);
        }
      } else {
        // After 3 attempts, just proceed with initialization
        console.log("Maximum reload attempts reached, proceeding anyway");
        setIsLoading(false);
        setIframeReady(true);

        if (onLoad) {
          onLoad();
        }

        // Initialize the SCORM API if not already done
        if (!isScormApiInitialized) {
          console.log("Attempting SCORM API initialization despite load issues");
          try {
            const initialized = await initializeScormApi();
            if (initialized) {
              console.log("SCORM API initialization completed successfully despite iframe load issues");
            } else {
              console.warn("SCORM API initialization failed");
            }
          } catch (err) {
            console.error("Error during SCORM API initialization:", err);
            if (onError) {
              onError(err instanceof Error ? err : new Error(String(err)));
            }
          }
        }
      }
    }
  }, [
    iframeReady,
    contentUrl,
    isScormApiInitialized,
    initializeScormApi,
    onLoad,
    onError,
    setIframeSrc,
  ]);

  // Effect to handle content URL changes
  useEffect(() => {
    if (!contentUrl) return;

    console.log("Content URL changed:", contentUrl);

    // Reset reload attempts
    reloadAttempts.current = 0;

    // Try to set the iframe src
    setIframeSrc(contentUrl);

    if (isMounted.current) {
      console.log("Iframe ready, setting content URL");
    }

    if (isMounted.current && !iframeReady) {
      console.log(
        "Iframe load event didn't fire after timeout, forcing completion"
      );
      // Handle the Promise explicitly to avoid unhandled Promise rejections
      handleIframeLoad()
        .then(() => {
          console.log("Iframe load event completed");
        })
        .catch((error) => {
          console.error("Error handling iframe load:", error);
          if (onError) {
            onError(error instanceof Error ? error : new Error(String(error)));
          }
        });
    }
    return;
  }, [contentUrl, iframeReady, handleIframeLoad, setIframeSrc, onError]);
  
  /**
   * Clean up resources when the component unmounts
   */
  useEffect(() => {
    isMounted.current = true;

    // Set up unmount cleanup
    return () => {
      console.log("ScormPreview unmounting, cleaning up resources");
      isMounted.current = false;
      iframeDomMounted.current = false;
      
      // If there's an active extraction, cancel it
      if (actualPackageKey.current) {
        cancelExtraction(actualPackageKey.current);
      }
      
      // Clear the commit interval if it exists
      if (commitIntervalRef.current) {
        clearInterval(commitIntervalRef.current);
        commitIntervalRef.current = null;
      }
      
      // Remove event listeners
      if (eventListenersRef.current.setValueHandler) {
        try {
          scormApi.removeEventListener(
            ScormApiEvent.LMSSetValue,
            eventListenersRef.current.setValueHandler
          );
        } catch (error) {
          console.warn("Error removing event listener:", error);
        }
      }
      
      if (eventListenersRef.current.sequencingHandler) {
        try {
          scormApi.removeEventListener(
            ScormApiEvent.SequencingRequest,
            eventListenersRef.current.sequencingHandler
          );
        } catch (error) {
          console.warn("Error removing event listener:", error);
        }
      }
      
      // Terminate the SCORM API if initialized
      if (scormApi.isInitialized()) {
        try {
          console.log("Terminating SCORM API");
          scormApi.commit(); // Final commit before termination
        scormApi.terminate();
        } catch (error) {
          console.warn("Error terminating SCORM API:", error);
        }
      }
    };
  }, []);
  
  // Set up the service worker and load content
    const setupServiceWorkerAndLoadContent = async () => {
    if (!isMounted.current) return;

    try {
      setIsLoading(true);
      setLoadingError(null);
      setIframeReady(false);

      // Reset progress state
      setProgressUpdates([]);

      // Generate a package key if not provided, but ensure it stays consistent
      if (!actualPackageKey.current) {
        actualPackageKey.current = packageKey || `scorm-${stableComponentId.current}`;
      }
      
      // Check if there's already an extraction in progress for this package
      const isAlreadyExtracting = isExtractionInProgress(actualPackageKey.current);
      if (isAlreadyExtracting) {
        console.log(`[Preview DEBUG] Extraction already in progress for ${actualPackageKey.current}, waiting for it to complete`);
        // We don't need to do anything here - the progress updates from the existing extraction
        // will be received by our message listener and we'll update the UI accordingly
        return;
      }
      
      // Register service worker if not already registered
      await registerScormServiceWorker();
        
        // If we have a direct file upload, we need to create a temporary URL
        let extractionUrl = packageUrl;
        if (packageFile) {
          extractionUrl = URL.createObjectURL(packageFile);
        }
        
        // Extract the package
      console.log(
        `[Preview DEBUG] Extracting SCORM package from ${extractionUrl} with key ${actualPackageKey.current}`
      );

      // Track extraction start time
      const extractionStartTime = Date.now();
        
        const result = await extractAndWaitForCompletion(
          extractionUrl,
          actualPackageKey.current,
        (progress, progressInfo) => {
            if (isMounted.current) {
            const now = Date.now();

            // Get stage information from progressInfo
            const stage =
              progressInfo?.stage || progressInfo?.status || "extracting";

              // Only update UI and log for significant changes
              const progressDiff = Math.abs(progress - lastDisplayedProgress.current);
              const shouldUpdate = progressDiff >= PROGRESS_UPDATE_THRESHOLD;
              
              // Always update for non-download stages or stage changes
              const isDownloadStage = stage === 'download';
              const isStageChange = stage !== progressUpdates[progressUpdates.length - 1]?.stage;
              
              if (shouldUpdate || !isDownloadStage || isStageChange) {
                // Only log when actually updating the UI
            console.log(
              `[Preview DEBUG] Progress update: ${Math.round(
                progress * 100
              )}%, stage: ${stage}, elapsed: ${now - extractionStartTime}ms`
            );

            // Store progress update history with stage information
            setProgressUpdates((prev) => [
              ...prev,
              {
                time: now,
                value: progress,
                stage,
              },
            ]);

            // Call the external progress callback if provided
              if (onProgress) {
                onProgress(progress);
                }
                
                // Update the last displayed progress
                lastDisplayedProgress.current = progress;
              }
            }
          }
        );
        
        // Revoke the object URL if we created one
        if (packageFile) {
          URL.revokeObjectURL(extractionUrl);
        }
        
      if (!result.success) {
        console.error(`[Preview DEBUG] Extraction failed:`, result.error);
        throw new Error(
          result.error || "Unknown error extracting SCORM package"
        );
      }

      console.log(
        "[Preview DEBUG] SCORM package extraction successful, total updates:",
        progressUpdates.length
      );
          
      // Store the manifest for later use
      if (result.success && result.scormObj) {
        try {
          // Create a valid manifest object regardless of input structure
          const manifest: ScormManifest = {
            version: "unknown",
            organizations: {},
            resources: {},
          };

          const scormData = result.scormObj as any;

          // Set version if available
          if (typeof scormData.version === "string") {
            manifest.version = scormData.version as ScormVersion;
          }

          // Check if we have the organizations format
          const hasOrganizations =
            typeof scormData === "object" &&
            scormData !== null &&
            "organizations" in scormData &&
            typeof scormData.organizations === "object";

          // Check if resources is an array
          const hasArrayResources =
            typeof scormData === "object" &&
            scormData !== null &&
            "resources" in scormData &&
            Array.isArray(scormData.resources);

          // Handle organizations if they exist
          if (hasOrganizations) {
            manifest.organizations = scormData.organizations;
          }

          // Handle resources which could be an array or object
          if ("resources" in scormData) {
            if (hasArrayResources) {
              // Convert array to object format
              const resourcesObj: Record<string, ScormResource> = {};
              scormData.resources.forEach((res: any) => {
                if (res && typeof res === "object" && "identifier" in res) {
                  resourcesObj[res.identifier] = res as ScormResource;
                }
              });
              manifest.resources = resourcesObj;
            } else if (
              typeof scormData.resources === "object" &&
              scormData.resources !== null
            ) {
              // Already in object format
              manifest.resources = scormData.resources;
            }
          }

          // Add other properties
          if (
            "defaultOrganizationIdentifier" in scormData &&
            typeof scormData.defaultOrganizationIdentifier === "string"
          ) {
            manifest.defaultOrganizationIdentifier =
              scormData.defaultOrganizationIdentifier;
          }

          if (
            "entryPoint" in scormData &&
            typeof scormData.entryPoint === "string"
          ) {
            manifest.entryPoint = scormData.entryPoint;
          }

          if (
            "metadata" in scormData &&
            typeof scormData.metadata === "object"
          ) {
            manifest.metadata = scormData.metadata;
          }

          setScormManifest(manifest);
        } catch (error) {
          console.error("Error processing SCORM manifest:", error);
        }
      }

      // Add back the findFirstResourceItem function
      const findFirstResourceItem = (items: ScormItem[]): ScormItem | null => {
        for (const item of items) {
          if (
            item.resourceIdentifier &&
            scormManifest &&
            scormManifest.resources &&
            scormManifest.resources[item.resourceIdentifier]?.href
          ) {
            return item;
          }

          if (item.children) {
            const found = findFirstResourceItem(item.children);
            if (found) {
              return found;
            }
          }
        }
        return null;
      };

      // Extract the details and determine the content path
      let contentPath = "";
      let startingItemId = null;

      // First check if the SCORM object has an entry point from the service worker
      if (
        result.scormObj &&
        "entryPoint" in result.scormObj &&
        result.scormObj.entryPoint
      ) {
        console.log(
          "Using entry point from service worker:",
          result.scormObj.entryPoint
        );
        contentPath = (result.scormObj.entryPoint as string) || "";
      }
      // If we have a specified item path from props, use that
      else if (itemPath) {
        console.log("Using specified item path from props:", itemPath);
            contentPath = itemPath;
      }
      // Otherwise check the manifest for a starting item
      else if (scormManifest) {
        console.log("SCORM object data:", scormManifest);
        // Get the default organization
        const orgId = scormManifest.defaultOrganizationIdentifier;

        if (orgId && scormManifest.organizations[orgId]) {
          const items = scormManifest.organizations[orgId].items;

          // Find the first item with a resource
          const firstItem = findFirstResourceItem(items);
          if (firstItem) {
            startingItemId = firstItem.identifier;

            // Get the resource for this item
            const resourceId = firstItem.resourceIdentifier;
            if (resourceId && scormManifest.resources[resourceId]) {
              const resource = scormManifest.resources[resourceId];
              if (resource.href) {
                contentPath = resource.href;
              }
            }
          }
        }

        // If we couldn't find a content path through navigation, try the entryPoint
        if (!contentPath && scormManifest.entryPoint) {
          contentPath = scormManifest.entryPoint;
        }
      }

      // If we still don't have a content path, check if there's an entry point in the service worker's scormObj
      if (!contentPath && result.scormObj) {
        if (
          typeof result.scormObj.entryPoint === "string" &&
          result.scormObj.entryPoint
        ) {
          contentPath = result.scormObj.entryPoint as string;
        }
      }

      // Final fallback - look for common entry points in file list
      if (!contentPath && result.fileList && Array.isArray(result.fileList)) {
        console.log(
          "Searching file list for common entry points",
          result.fileList
        );

        // Common entry point filenames
        const commonEntryPoints = [
          "scormRLO.htm"
        ];

        // Try to find any of the common entry points
        for (const entry of commonEntryPoints) {
          if (result.fileList.includes(entry)) {
            contentPath = entry;
            console.log("Found common entry point:", contentPath);
            break;
          }
        }
      }

      // If we still don't have a content path, throw an error
      if (!contentPath) {
        throw new Error("Could not determine entry point for SCORM package");
          }
          
      // Get the URL for the content file and set it
      const url = createContentUrl(contentPath);
          
      if (iframeDomMounted.current) {
            setContentUrl(url);

        // Set the current item ID if we found one
        if (startingItemId) {
          setCurrentItemId(startingItemId);
        }

        // Call the onPackageExtracted callback if provided
        if (scormManifest && onPackageExtracted) {
          try {
            // Get the original package from the service worker cache
            const packageData = await getScormPackage(packageKey || "scorm-preview");
            if (packageData) {
              onPackageExtracted(packageData);
        }
      } catch (error) {
            console.error("Error getting extracted package for callback:", error);
          }
        }
        }
      } catch (error) {
      console.error("[Preview DEBUG] Error setting up SCORM content:", error);
        
        if (isMounted.current) {
        setLoadingError(
          error instanceof Error ? error : new Error(String(error))
        );
          setIsLoading(false);
        
        if (onError) {
          onError(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  };
  
  /**
   * Handle reload button click
   */
  const handleReload = () => {
    // Reset states
    setIsLoading(true);
    setLoadingError(null);
    
    // Trigger a fresh load
    setupServiceWorkerAndLoadContent();
  };

  // Initialize the service worker and load content when the component mounts
  useEffect(() => {
    setupServiceWorkerAndLoadContent();
  }, [packageUrl, packageKey, packageFile]);

  /**
   * Force a retry of SCORM API initialization
   */
  const forceRetryInitialization = useCallback(() => {
    setInitializationAttempts(0);
    initializeScormApi(true);
  }, [initializeScormApi]);

  // Render the component
  return (
    <div className={cn("relative w-full h-full", className)}>
      {/* Display loading state */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/90 dark:bg-background/90 z-10">
          <ScormLoadingIndicator
            progress={displayedProgress}
            stage={displayedStage || "downloading"} 
            processedFiles={progressInfo?.processedFiles}
            fileCount={progressInfo?.fileCount}
            totalSize={progressInfo?.totalSize}
            elapsedTime={progressInfo?.elapsedTime}
          />
        </div>
      )}
      
      {/* Display error state */}
      {loadingError && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/90 dark:bg-background/90 z-10">
          <ScormErrorDisplay 
            error={loadingError} 
            onRetry={handleReload} 
            isRetrying={isRetrying} 
            // Special handling for API errors
            isApiError={loadingError?.message?.includes('SCORM API')}
            onForceRetry={() => {
              if (iframeRef.current && iframeRef.current.src) {
                console.log("Forcing reload of iframe with current URL:", iframeRef.current.src);
                setIframeSrc(iframeRef.current.src);
              }
            }}
          />
        </div>
      )}
      
      {/* Only render the iframe on the client side */}
      {isClient && (
        <ScormErrorBoundary
          onError={handleError}
        >
        <iframe
            key={stableComponentId.current}
          ref={iframeRef}
            className={cn("w-full h-full border-0", {
              "opacity-0": isLoading || !iframeReady,
            })}
            allowFullScreen
          title="SCORM Content"
            // Use less restrictive sandbox settings
          sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts"
            onLoad={() => {
              // Only handle load when we have a source
              if (iframeRef.current && iframeRef.current.src) {
                setIframeReady(true);
              }
            }}
          />
        </ScormErrorBoundary>
      )}
    </div>
  );
} 
