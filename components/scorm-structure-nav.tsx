"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronRight, FileText, Folder, FolderOpen, Info, Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "react-hot-toast";

// Import service worker functions
import { 
  isServiceWorkerSupported, 
  hasActiveServiceWorkerController,
  extractAndWaitForCompletion,
  createKeyFromUrl,
  getScormFileUrl,
  ScormExtractionResult
} from "@/lib/client/service-worker-registry";

// Import client-side navigation services
import { 
  buildNavigationTree, 
  navigateToItem, 
  NavigationItem,
  findNavigationItemById
} from "@/lib/client/scorm-navigation";
import { getScormPackage, storeScormPackage } from "@/lib/client/scorm-cache";
import { downloadAndExtractScorm, ExtractedScormPackage } from "@/lib/client/scorm-extractor";

// Import types from scorm extractor (still needed for ExtractedScormPackage type)
import { ScormManifest, ScormItem, ScormResource, ScormVersion } from "@/lib/scorm";

// Types for component props
interface ScormStructureNavProps {
  /**
   * ID of the course the SCORM package belongs to
   * Used for generating a cache key
   */
  courseId: string;
  
  /**
   * ID of the SCORM package
   * Used for reference and potentially for logging
   */
  scormPackageId: string;
  
  /**
   * URL of the SCORM package to load
   * This will be passed to the service worker for extraction
   */
  scormUrl: string;
  
  /**
   * Called when navigation occurs with the URL to navigate to
   * The URL will be a service worker URL in the format:
   * /__scorm__/[cache-key]/[file-path]
   */
  onNavigate?: (url: string) => void;
  
  /**
   * Optional pre-extracted package data (to avoid extraction)
   * If provided, the component will not attempt to extract the package
   * This is useful when the package has already been extracted elsewhere
   */
  extractedPackage?: ExtractedScormPackage;
}

/**
 * Adapter function to convert service worker extraction result to ExtractedScormPackage format
 * This function handles various formats that might be returned by the service worker
 */
function adaptServiceWorkerResultToExtractedPackage(
  result: ScormExtractionResult,
  originalUrl: string
): ExtractedScormPackage {
  // Create a basic manifest structure
  const manifest: ScormManifest = {
    version: (result.scormObj?.version as ScormVersion) || "1.2" as ScormVersion,
    organizations: {},
    resources: {}
  };
  
  // If we have a more complete manifest in the result, extract its data
  if (result.scormObj) {
    // Extract organizations if available
    if ("organizations" in result.scormObj && 
        typeof result.scormObj.organizations === "object" && 
        result.scormObj.organizations !== null) {
      manifest.organizations = result.scormObj.organizations as Record<string, { title: string; items: ScormItem[] }>;
    } else {
      // If there are no organizations, try to create a default one
      // This helps with SCORM packages that might not have a proper manifest
      manifest.organizations = {
        "default": {
          title: "Content",
          items: []
        }
      };
      
      // If we have a list of files, try to build a basic structure
      if (result.fileList && result.fileList.length > 0) {
        const htmlFiles = result.fileList.filter(file => 
          file.endsWith('.html') || file.endsWith('.htm')
        );
        
        if (htmlFiles.length > 0) {
          // Add files as direct items
          manifest.organizations["default"].items = htmlFiles.map((file, index) => ({
            identifier: `file_${index}`,
            title: file.split('/').pop() || file,
            resourceIdentifier: `res_${index}`,
            children: []
          }));
          
          // Create matching resources
          htmlFiles.forEach((file, index) => {
            manifest.resources[`res_${index}`] = {
              identifier: `res_${index}`,
              type: "webcontent",
              href: file,
              dependencies: [],
              files: []
            };
          });
        }
      }
    }
    
    // Extract resources
    if ("resources" in result.scormObj) {
      if (Array.isArray(result.scormObj.resources)) {
        // Convert from array to object format if needed
        result.scormObj.resources.forEach(res => {
          if (res && typeof res === "object" && "identifier" in res) {
            manifest.resources[res.identifier] = res as ScormResource;
          }
        });
      } else if (result.scormObj.resources && typeof result.scormObj.resources === "object") {
        manifest.resources = result.scormObj.resources as Record<string, ScormResource>;
      }
    } else if (result.fileList && result.fileList.length > 0 && Object.keys(manifest.resources).length === 0) {
      // If no resources were found but we have a file list, create resources from the file list
      // This is a fallback for packages with non-standard structure
      const htmlFiles = result.fileList.filter(file => 
        file.endsWith('.html') || file.endsWith('.htm')
      );
      
      htmlFiles.forEach((file, index) => {
        const identifier = `resource_${index}`;
        manifest.resources[identifier] = {
          identifier,
          type: "webcontent",
          href: file,
          dependencies: [],
          files: []
        };
      });
    }
    
    // Copy other properties
    if ("defaultOrganizationIdentifier" in result.scormObj && 
        typeof result.scormObj.defaultOrganizationIdentifier === "string") {
      manifest.defaultOrganizationIdentifier = result.scormObj.defaultOrganizationIdentifier;
    }
    
    if ("entryPoint" in result.scormObj && typeof result.scormObj.entryPoint === "string") {
      manifest.entryPoint = result.scormObj.entryPoint;
    } else if (result.fileList) {
      // Try to find a potential entry point from the file list
      const entryPoint = findPotentialEntryPoint(result.fileList);
      if (entryPoint) {
        manifest.entryPoint = entryPoint;
      }
    }
  }
  
  // Return an object that simulates an ExtractedScormPackage
  return {
    manifest,
    files: new Map(), // Empty map as we'll use service worker URLs
    originalUrl: originalUrl,
    extractedAt: Date.now(),
    version: manifest.version
  };
}

/**
 * Helper function to find a potential entry point in a list of files
 */
function findPotentialEntryPoint(fileList: string[]): string | undefined {
  if (!Array.isArray(fileList) || fileList.length === 0) {
    return undefined;
  }
  
  // Common entry point filenames in order of likelihood
  const commonEntryPoints = [
    "index.html",
    "default.html",
    "start.html",
    "launch.html",
    "scormdriver.html",
    "story.html",
    "player.html",
    "scormcontent/index.html",
    "imsmanifest.xml" // Fallback to manifest
  ];
  
  // Try to find any of the common entry points
  for (const entry of commonEntryPoints) {
    const match = fileList.find(file => file.endsWith(entry));
    if (match) {
      return match;
    }
  }
  
  // If no common entry point, look for any HTML file
  const htmlFile = fileList.find(file => 
    file.endsWith('.html') || file.endsWith('.htm')
  );
  
  return htmlFile;
}

/**
 * ScormStructureNav Component
 * 
 * Renders a navigation tree for SCORM content based on the package structure.
 * Uses the service worker infrastructure to extract and cache SCORM packages.
 * 
 * Requirements:
 * - Service worker must be registered and active for optimal functionality
 * - Requires a valid SCORM package URL or pre-extracted package data
 * 
 * @param props Component props
 * @returns React component
 */
export const ScormStructureNav = ({
  courseId,
  scormPackageId,
  scormUrl,
  onNavigate,
  extractedPackage: passedExtractedPackage
}: ScormStructureNavProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const [isLoading, setIsLoading] = useState(true);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [navigationTree, setNavigationTree] = useState<NavigationItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [navLoading, setNavLoading] = useState<string | null>(null);
  const [extractedPackage, setExtractedPackage] = useState<ExtractedScormPackage | null>(
    passedExtractedPackage || null
  );
  
  // Current active item based on URL search param
  const currentItemId = searchParams.get("item");
  
  // Use a reference to check if the component is mounted
  const isMounted = useRef(true);

  // Check if service worker is available
  const isServiceWorkerAvailable = isServiceWorkerSupported() && hasActiveServiceWorkerController();

  // Generate a cache key from the URL and courseId
  const cacheKey = useCallback(() => {
    return createKeyFromUrl(`scorm-${courseId}-${scormUrl}`);
  }, [courseId, scormUrl]);

  // Memoize the expandParentsOfItem function
  const expandParentsOfItem = useCallback((navItems: NavigationItem[], itemId: string) => {
    // Recursive function to find an item and its parents
    const findItemAndParents = (items: NavigationItem[], id: string, parents: string[] = []): string[] | null => {
      for (const item of items) {
        if (item.id === id) {
          return parents;
        }
        if (item.children && item.children.length > 0) {
          const result = findItemAndParents(item.children, id, [...parents, item.id]);
          if (result) return result;
        }
      }
      return null;
    };
    
    // Find parents in all items
    for (const navItem of navItems) {
      const parents = findItemAndParents(navItem.children, itemId);
      if (parents) {
        // Add the top-level item ID and all parent IDs to expanded items
        setExpandedItems(prev => {
          const newSet = new Set(prev);
          newSet.add(navItem.id);
          parents.forEach(id => newSet.add(id));
          return newSet;
        });
        break;
      }
    }
  }, []);

  // Load SCORM package and build navigation tree
  useEffect(() => {
    if (!isMounted.current) return;
    
    const loadScormNavigation = async () => {
      try {
        setIsLoading(true);
        setError(null); // Reset any previous errors
        
        // If a package was provided directly, use that
        if (passedExtractedPackage) {
          console.log("Using provided SCORM package");
          setExtractedPackage(passedExtractedPackage);
          
          // Build navigation tree
          const navTree = buildNavigationTree(passedExtractedPackage);
          setNavigationTree(navTree);
          
          // Auto-expand the first organization
          if (navTree.length > 0) {
            setExpandedItems(prev => {
              const newSet = new Set(prev);
              newSet.add(navTree[0].id);
              return newSet;
            });
          }
          
          setIsLoading(false);
          return;
        }
        
        // Generate a key for the SCORM package
        const key = cacheKey();
        
        // Check service worker availability
        if (!isServiceWorkerAvailable) {
          console.warn("Service worker not available or not controlling this page. Some features may be limited.");
          // Continue with extraction attempt, but service worker functionality might be limited
        }
        
        // Use the service worker to extract the package
        console.log("Extracting SCORM package via service worker:", scormUrl);
        
        // Check if URL is empty before trying to download
        if (!scormUrl || scormUrl.trim() === "") {
          throw new Error("No SCORM URL provided for download");
        }
        
        try {
          const result = await extractAndWaitForCompletion(
            scormUrl,
            key,
            (progress, progressInfo) => {
              if (isMounted.current) {
                setExtractionProgress(progress);
                console.log(`Extraction progress: ${Math.round(progress * 100)}%`);
              }
            }
          );
          
          if (!result.success) {
            throw new Error(result.error || "Failed to extract SCORM package");
          }
          
          console.log("SCORM package extraction complete:", result);
          
          // Convert the service worker result format to the format expected by buildNavigationTree
          const adaptedPackage = adaptServiceWorkerResultToExtractedPackage(result, scormUrl);
          
          if (!isMounted.current) return;
          
          // Store the extracted package
          setExtractedPackage(adaptedPackage);
          
          // Build navigation tree
          const navTree = buildNavigationTree(adaptedPackage);
          setNavigationTree(navTree);
          
          // Auto-expand the first organization
          if (navTree.length > 0) {
            setExpandedItems(prev => {
              const newSet = new Set(prev);
              newSet.add(navTree[0].id);
              return newSet;
            });
          }
        } catch (err) {
          // Handle service worker specific errors
          if (err instanceof Error) {
            // Extract more detailed error information
            const errorMessage = err.message;
            if (errorMessage.includes("Service Worker not supported") || 
                errorMessage.includes("not controlling this page") ||
                !isServiceWorkerAvailable) {
              throw new Error("Service Worker not available. SCORM navigation may be limited.");
            } else if (errorMessage.includes("timed out") || errorMessage.includes("timeout")) {
              throw new Error("SCORM extraction timed out. The package may be too large or the connection too slow.");
            } else if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
              throw new Error("Network error while downloading SCORM package. Please check your connection.");
            }
          }
          // Re-throw the error for the outer catch block to handle
          throw err;
        }
      } catch (err) {
        console.error("Error loading SCORM navigation:", err);
        if (isMounted.current) {
          if (err instanceof Error) {
            // Use the error message directly if it's already formatted above
            if (err.message.includes("Service Worker") || 
                err.message.includes("SCORM extraction timed out") ||
                err.message.includes("Network error")) {
              setError(err.message);
            } else {
              // Generic error message for other cases
              setError("Failed to load SCORM structure. Please try again later.");
            }
          } else {
            setError("An unknown error occurred while loading the SCORM structure.");
          }
        }
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
        }
      }
    };
    
    loadScormNavigation();
    
    // Cleanup
    return () => {
      isMounted.current = false;
    };
  }, [scormUrl, courseId, cacheKey, passedExtractedPackage, isServiceWorkerAvailable]);
  
  // Handle expanding parents when currentItemId changes
  useEffect(() => {
    if (currentItemId && navigationTree.length > 0) {
      expandParentsOfItem(navigationTree, currentItemId);
    }
  }, [currentItemId, navigationTree, expandParentsOfItem]);
  
  // Toggle expanded state for an item
  const toggleExpand = useCallback((itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);
  
  // Navigate to a specific SCORM item
  const handleNavigateToItem = useCallback(async (itemId: string) => {
    if (!extractedPackage) {
      toast.error("SCORM package not loaded");
      return;
    }
    
    try {
      setNavLoading(itemId);
      
      // Find the navigation item in the tree
      const navItem = findNavigationItemById(navigationTree, itemId);
      if (!navItem || !navItem.path) {
        throw new Error("Invalid navigation item or missing path");
      }
      
      // Instead of using navigateToItem which creates object URLs from extracted files,
      // use the service worker URL directly
      const filePath = navItem.path;
      const key = cacheKey();
      const fileUrl = getScormFileUrl(key, filePath);
      
      console.log(`Navigating to SCORM item: ${itemId}, path: ${filePath}, url: ${fileUrl}`);
      
      // Update URL with the item ID
      const newUrl = `${pathname}?item=${itemId}`;
      router.push(newUrl, { scroll: false });
      
      // If a navigation callback is provided, call it with the resource URL
      if (onNavigate) {
        onNavigate(fileUrl);
      }
    } catch (err) {
      console.error("Error navigating to SCORM item:", err);
      toast.error("Failed to navigate to the selected item");
    } finally {
      setNavLoading(null);
    }
  }, [extractedPackage, navigationTree, pathname, router, onNavigate, cacheKey]);
  
  // Render a navigation item and its children recursively
  const renderNavigationItem = (item: NavigationItem, level = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.id);
    const isActive = currentItemId === item.id;
    const hasContent = item.hasContent;
    const isLoading = navLoading === item.id;
    
    return (
      <div key={item.id} className="w-full">
        <div
          className={cn(
            "flex items-center w-full hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer transition-colors",
            isActive && "bg-slate-100 dark:bg-slate-800 font-semibold"
          )}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
        >
          {hasChildren && (
            <button
              onClick={() => toggleExpand(item.id)}
              className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md mr-1"
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 text-slate-500 transition-transform",
                  isExpanded && "transform rotate-90"
                )}
              />
            </button>
          )}
          
          {!hasChildren && hasContent && (
            <div className="p-2 mr-1">
              <FileText className="h-4 w-4 text-slate-500" />
            </div>
          )}
          
          {!hasChildren && !hasContent && (
            <div className="p-2 mr-1">
              <Info className="h-4 w-4 text-slate-500" />
            </div>
          )}
          
          {hasChildren && !hasContent && (
            <div className="p-2 mr-1">
              {isExpanded ? (
                <FolderOpen className="h-4 w-4 text-slate-500" />
              ) : (
                <Folder className="h-4 w-4 text-slate-500" />
              )}
            </div>
          )}
          
          <div
            className={cn(
              "flex-1 py-2 pr-2 text-sm truncate",
              hasContent && "cursor-pointer hover:underline",
              isActive && "font-semibold"
            )}
            onClick={() => {
              if (hasContent) {
                handleNavigateToItem(item.id);
              } else if (hasChildren) {
                toggleExpand(item.id);
              }
            }}
          >
            {item.title}
          </div>
          
          {isLoading && (
            <div className="pr-2">
              <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
            </div>
          )}
        </div>
        
        {hasChildren && isExpanded && (
          <div className="mt-1">
            {item.children.map((child) => renderNavigationItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };
  
  // If there's an error, show error state with more detailed information
  if (error) {
    return (
      <div className="p-4 border rounded-md bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200">
        <p className="text-sm font-medium">{error}</p>
        {error.includes("Service Worker") && (
          <p className="mt-1 text-xs">
            This browser may not support Service Workers or they may be disabled.
            Some SCORM content may not load properly.
          </p>
        )}
        <button
          onClick={() => window.location.reload()}
          className="mt-2 text-xs underline"
        >
          Retry
        </button>
      </div>
    );
  }
  
  // If loading, show loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-4 space-y-2">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        <p className="text-sm text-slate-500">
          Loading SCORM structure...
          {extractionProgress > 0 && (
            <span className="ml-1">
              {Math.round(extractionProgress * 100)}%
            </span>
          )}
        </p>
      </div>
    );
  }
  
  // If no navigation tree, show empty state
  if (navigationTree.length === 0) {
    return (
      <div className="p-4 border rounded-md bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200">
        <p className="text-sm">No content structure available.</p>
      </div>
    );
  }
  
  // Render the navigation tree
  return (
    <div className="py-2 w-full">
      {navigationTree.map((item) => renderNavigationItem(item))}
    </div>
  );
}; 