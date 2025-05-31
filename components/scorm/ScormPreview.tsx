"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
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
   * Called when navigation occurs
   */
  onNavigate?: (itemId: string, itemTitle?: string) => void;
  
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
  const getStageText = () => {
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
  };

  // Get appropriate icon for current stage
  const getStageIcon = () => {
    if (!stage)
      return <Loader2 className="w-12 h-12 animate-spin mb-4 text-blue-600" />;

    const stageKey = stage.toLowerCase();

    if (stageKey === "downloading" || stageKey === "download") {
      return (
        <div className="relative w-12 h-12 mb-4">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-blue-800"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </div>
        </div>
      );
    }

    if (stageKey === "processing") {
      return (
        <div className="relative w-12 h-12 mb-4">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-blue-800"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
        </div>
      );
    }

    if (stageKey === "extracting" || stageKey === "extract") {
      return (
        <div className="relative w-12 h-12 mb-4">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-blue-800"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"
              />
            </svg>
          </div>
        </div>
      );
    }

    if (stageKey === "complete") {
      return (
        <div className="relative w-12 h-12 mb-4">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>
      );
    }

    return <Loader2 className="w-12 h-12 animate-spin mb-4 text-blue-600" />;
  };

  // Format file size for display
  const formatSize = (bytes?: number) => {
    if (!bytes) return "";

    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  // Get display message based on stage and progress
  const getMessage = () => {
    const stageText = getStageText();

    if (percentage < 1) {
      return "Preparing...";
    }

    let message = `${Math.round(percentage)}% complete`;

    if (stageText) {
      message = `${stageText} - ${message}`;
    }

    return message;
  };

  // Get file progress text if available
  const getFileProgressText = () => {
    if (!processedFiles || !fileCount) return "";

    return `${processedFiles}/${fileCount} files`;
  };

  // Format elapsed time
  const formatElapsedTime = () => {
    if (!elapsedTime) return "";

    const seconds = Math.floor(elapsedTime / 1000);
    const minutes = Math.floor(seconds / 60);

    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }

    return `${seconds}s`;
  };

  // Get estimated time remaining (if enough information is available)
  const getEstimatedTimeRemaining = () => {
    // Returning null to disable time remaining calculation as requested
    return null;
  };

  // Determine progress bar color based on stage
  const getProgressBarColor = () => {
    if (!stage) return "bg-blue-600";

    const stageKey = stage.toLowerCase();

    if (stageKey === "downloading" || stageKey === "download") {
      return "bg-sky-500";
    }

    if (stageKey === "processing") {
      return "bg-indigo-600";
    }

    if (stageKey === "complete") {
      return "bg-green-500";
    }

    return "bg-blue-600";
  };

  // Get progress steps visualization
  const renderProgressSteps = () => {
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
                      ? "bg-blue-600 ring-2 ring-blue-200"
                      : isCompleted
                      ? "bg-green-500"
                      : "bg-gray-200"
                  }
                `}
              />
              <span
                className={`text-xs ${
                  isActive
                    ? "text-blue-600 font-medium"
                    : isCompleted
                    ? "text-green-500"
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
  };

  const estimatedRemaining = getEstimatedTimeRemaining();

  // Debug information - only render on client side
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white rounded shadow-md max-w-md mx-auto my-8 text-center">
      {getStageIcon()}

      <h3 className="text-lg font-medium mb-2">Loading SCORM Content</h3>

      {/* Progress steps visualization */}
      {renderProgressSteps()}

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
        <div
          className={`${getProgressBarColor()} h-2.5 rounded-full transition-all duration-300 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Progress percentage */}
      <p className="text-sm font-medium text-gray-700">{getMessage()}</p>

      {/* Additional progress details */}
      {(fileCount || totalSize || elapsedTime) && (
        <div className="mt-3 flex flex-wrap justify-center items-center gap-x-3 gap-y-1">
          {getFileProgressText() && (
            <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-700 flex items-center">
              <svg
                className="w-3 h-3 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              {getFileProgressText()}
            </span>
          )}
          {totalSize && (
            <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-700 flex items-center">
              <svg
                className="w-3 h-3 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                />
              </svg>
              {formatSize(totalSize)}
            </span>
          )}
          {elapsedTime && (
            <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-700 flex items-center">
              <svg
                className="w-3 h-3 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {formatElapsedTime()}
            </span>
          )}
        </div>
      )}

    </div>
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
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 p-3 rounded-full bg-red-100 text-red-600">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Failed to load SCORM content</h3>
      <p className="text-sm text-gray-500 mb-4 max-w-md">
        {error.message}
      </p>
      
      {/* Add more detailed information for API errors */}
      {isApiError && (
        <div className="mb-4 p-4 bg-gray-50 rounded text-xs text-left overflow-auto w-full max-w-md max-h-32">
          <h4 className="font-medium mb-1">Technical Details:</h4>
          <pre className="whitespace-pre-wrap">{error.stack || error.message}</pre>
        </div>
      )}
      
      <div className="flex gap-3">
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isRetrying}
          >
            {isRetrying ? "Retrying..." : "Try Again"}
          </button>
        )}
        
        {onForceRetry && (
          <button
            onClick={onForceRetry}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Retry API Initialization
          </button>
        )}
      </div>
    </div>
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
  onNavigate,
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

          // Notify about navigation if callback provided
          if (startingItemId && onNavigate && scormManifest) {
            // Use the properly typed manifest that we've already processed
            const orgId = scormManifest.defaultOrganizationIdentifier;
            if (orgId && scormManifest.organizations[orgId]) {
              const items = scormManifest.organizations[orgId].items;
              const item = findItemById(items, startingItemId);
              if (item) {
                onNavigate(startingItemId, item.title);
              }
            }
          }
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
        <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-10">
          <ScormLoadingIndicator
            progress={progressInfo?.progress || 0}
            stage={progressInfo?.stage}
            processedFiles={progressInfo?.processedFiles}
            fileCount={progressInfo?.fileCount}
            totalSize={progressInfo?.totalSize}
            elapsedTime={progressInfo?.elapsedTime}
          />
          
        </div>
      )}
      
      {/* Display error state */}
      {loadingError && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-10">
          <ScormErrorDisplay 
            error={loadingError} 
            onRetry={handleReload} 
            isRetrying={isRetrying} 
            isApiError={!isScormApiInitialized}
            onForceRetry={forceRetryInitialization}
          />
        </div>
      )}
      
      {/* Only render the iframe on the client side */}
      {isClient && (
        <ScormErrorBoundary
          onError={(error) => {
            console.log("SCORM content error caught by boundary:", error);
            setLoadingError(error);
            setIsLoading(false);
          }}
        >
        <iframe
            key={stableComponentId.current}
          ref={iframeRef}
            src="" // Start with empty src - will be set once iframe is mounted
            className={cn(
              "w-full h-full border-0",
              !contentUrl && "hidden" // Hide when no content URL
            )}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          title="SCORM Content"
            // Use less restrictive sandbox settings
          sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts"
            onLoad={() => {
              // Only process load events when we have a real src
              if (
                iframeRef.current?.src &&
                !iframeRef.current.src.endsWith("about:blank")
              ) {
                console.log(
                  "Iframe onLoad event fired for URL:",
                  iframeRef.current?.src
                );
                handleIframeLoad();
              } else {
                console.log("Initial iframe mount detected (empty src)");
              }
            }}
          />
        </ScormErrorBoundary>
      )}

      {/* Add debug overlay - only on client */}
      {isClient && (
        <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm p-3 rounded-lg text-xs border border-slate-200 shadow-md z-10 max-w-[300px] transition-all duration-300 hover:opacity-100 opacity-80">
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="font-semibold text-slate-700 flex items-center">
              <span className="bg-blue-500 w-2 h-2 rounded-full mr-1.5"></span>
              SCORM Status
            </h4>
            <Badge variant={isScormApiInitialized ? "secondary" : "outline"} className="text-[10px] h-4">
              {isScormApiInitialized ? "API Ready" : "API Pending"}
            </Badge>
          </div>
          
          <div className="space-y-1.5 divide-y divide-slate-100">
            <div className="pb-1.5">
              <div className="grid grid-cols-2 gap-x-2">
                <div className="text-slate-500">Content URL:</div>
                <div className="text-slate-700 truncate">
                  {contentUrl ? contentUrl.split('/').pop() : "None"}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-2">
                <div className="text-slate-500">Iframe Ready:</div>
                <div className="text-slate-700">
                  {iframeReady ? 
                    <span className="text-green-600">Yes</span> : 
                    <span className="text-amber-600">No</span>
                  }
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-2">
                <div className="text-slate-500">SCORM Version:</div>
                <div className="text-slate-700">{scormVersion}</div>
              </div>
            </div>
            
            <div className="py-1.5">
              <div className="grid grid-cols-2 gap-x-2">
                <div className="text-slate-500">Init Attempts:</div>
                <div className="text-slate-700">
                  <span className={initializationAttempts > 0 ? "text-amber-600" : "text-slate-700"}>
                    {initializationAttempts}/{maxInitAttempts}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-2">
                <div className="text-slate-500">Loading State:</div>
                <div className="text-slate-700">
                  {isLoading ? 
                    <span className="text-amber-600">Loading</span> : 
                    <span className="text-green-600">Complete</span>
                  }
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-2">
                <div className="text-slate-500">Retrying:</div>
                <div className="text-slate-700">
                  {isRetrying ? 
                    <span className="text-amber-600">Yes</span> : 
                    <span className="text-slate-700">No</span>
                  }
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex gap-1.5 mt-2.5">
            <Button
              onClick={() => {
                if (iframeRef.current && contentUrl) {
                  // Use a counter instead of Date.now() for cache busting
                  const counter = reloadAttempts.current + 1;
                  reloadAttempts.current = counter;
                  const url = contentUrl.includes('?') 
                    ? `${contentUrl}&reload=${counter}` 
                    : `${contentUrl}?reload=${counter}`;
                  console.log("Manually forcing iframe reload to:", url);
                  setIframeSrc(url);
                }
              }}
              disabled={!contentUrl}
              className={cn(
                "px-2 py-1 rounded text-[10px] h-6 flex-1",
                contentUrl
                  ? "bg-blue-500 text-white hover:bg-blue-600"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              )}
            >
              <span className="truncate">Reload Frame</span>
            </Button>
            <Button
              onClick={forceRetryInitialization}
              disabled={isScormApiInitialized}
              className={cn(
                "px-2 py-1 rounded text-[10px] h-6 flex-1",
                !isScormApiInitialized
                  ? "bg-green-500 text-white hover:bg-green-600"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              )}
            >
              <span className="truncate">Retry API</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
} 
