"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronRight, FileText, Folder, FolderOpen, Info, Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "react-hot-toast";

// Import client-side navigation services
import { 
  buildNavigationTree, 
  navigateToItem, 
  NavigationItem 
} from "@/lib/client/scorm-navigation";
import { getScormPackage, storeScormPackage } from "@/lib/client/scorm-cache";
import { downloadAndExtractScorm, ExtractedScormPackage } from "@/lib/client/scorm-extractor";

// Types for component props
interface ScormStructureNavProps {
  courseId: string;
  scormPackageId: string;
  scormUrl: string;
  onNavigate?: (url: string) => void;
  extractedPackage?: ExtractedScormPackage; // Optional: Pass already extracted package
}

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

  // Generate a cache key from the URL and courseId
  const cacheKey = useCallback(() => {
    return `scorm-${courseId}-${encodeURIComponent(scormUrl)}`;
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
        
        // If no direct package, try cache or download
        const key = cacheKey();
        
        // Try to get from cache first
        const cachedPackage = await getScormPackage(key);
        
        let scormPackage: ExtractedScormPackage;
        
        if (cachedPackage) {
          console.log("Using cached SCORM package");
          scormPackage = cachedPackage;
        } else {
          console.log("Downloading and extracting SCORM package");
          
          // Check if URL is empty before trying to download
          if (!scormUrl || scormUrl.trim() === "") {
            throw new Error("No SCORM URL provided for download");
          }
          
          // Download and extract
          scormPackage = await downloadAndExtractScorm(scormUrl, (progress) => {
            if (isMounted.current) {
              setExtractionProgress(progress);
            }
          });
          
          // Store in cache
          await storeScormPackage(key, scormPackage);
        }
        
        if (!isMounted.current) return;
        
        // Store the extracted package
        setExtractedPackage(scormPackage);
        
        // Build navigation tree
        const navTree = buildNavigationTree(scormPackage);
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
        console.error("Error loading SCORM navigation:", err);
        if (isMounted.current) {
          setError("Failed to load SCORM structure");
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
  }, [scormUrl, courseId, cacheKey, passedExtractedPackage]);
  
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
      
      // Use client-side navigation service
      const navigationResult = await navigateToItem(extractedPackage, itemId);
      
      if (!navigationResult) {
        throw new Error("Failed to navigate to item");
      }
      
      // Update URL with the item ID
      const newUrl = `${pathname}?item=${itemId}`;
      router.push(newUrl, { scroll: false });
      
      // If a navigation callback is provided, call it with the resource URL
      if (onNavigate && navigationResult.url) {
        onNavigate(navigationResult.url);
      }
    } catch (err) {
      console.error("Error navigating to SCORM item:", err);
      toast.error("Failed to navigate to the selected item");
    } finally {
      setNavLoading(null);
    }
  }, [extractedPackage, pathname, router, onNavigate]);
  
  // Render a navigation item and its children recursively
  const renderNavigationItem = (item: NavigationItem, level = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.id);
    const isActive = currentItemId === item.id;
    const hasContent = item.hasContent;
    const isLoading = navLoading === item.id;
    
    return (
      <div key={item.id} className="w-full">
        <button
          onClick={() => {
            if (hasChildren) {
              toggleExpand(item.id);
            }
            if (hasContent && !isLoading) {
              handleNavigateToItem(item.id);
            }
          }}
          className={cn(
            "group flex w-full items-center py-2 px-3 text-sm font-medium transition-all",
            hasContent ? "hover:bg-slate-100 cursor-pointer" : "cursor-default",
            level > 0 && `pl-${level * 3 + 3}`,
            isActive && "bg-slate-100 text-slate-900"
          )}
        >
          <div className="flex items-center gap-x-2 overflow-hidden">
            {isLoading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-500" />
            ) : hasChildren ? (
              isExpanded ? (
                <FolderOpen className="h-4 w-4 shrink-0 text-slate-500" />
              ) : (
                <Folder className="h-4 w-4 shrink-0 text-slate-500" />
              )
            ) : hasContent ? (
              <FileText className="h-4 w-4 shrink-0 text-slate-500" />
            ) : (
              <Info className="h-4 w-4 shrink-0 text-slate-500" />
            )}
            
            <span className="truncate">{item.title}</span>
          </div>
          
          {hasChildren && (
            <ChevronRight className={cn(
              "h-4 w-4 shrink-0 transition-all ml-auto text-slate-500",
              isExpanded && "rotate-90"
            )} />
          )}
        </button>
        
        {hasChildren && isExpanded && (
          <div className="ml-1 border-l border-slate-200">
            {item.children?.map(child => renderNavigationItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="mt-4 text-sm text-slate-600">
          {extractionProgress > 0 && extractionProgress < 1
            ? `Extracting content... ${Math.round(extractionProgress * 100)}%`
            : "Loading..."}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-10 px-4">
        <p className="text-center text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="py-2">
        <h3 className="px-4 text-lg font-medium text-slate-900 mb-2">Content</h3>
        <div className="space-y-1">
          {navigationTree.map(item => (
            <div key={item.id} className="w-full">
              <button
                onClick={() => toggleExpand(item.id)}
                className="group flex w-full items-center py-2 px-4 text-sm font-medium text-slate-900 transition-all"
              >
                {expandedItems.has(item.id) ? (
                  <FolderOpen className="h-4 w-4 shrink-0 mr-2 text-slate-500" />
                ) : (
                  <Folder className="h-4 w-4 shrink-0 mr-2 text-slate-500" />
                )}
                <span className="truncate">{item.title}</span>
                <ChevronRight className={cn(
                  "h-4 w-4 shrink-0 transition-all ml-auto text-slate-500",
                  expandedItems.has(item.id) && "rotate-90"
                )} />
              </button>
              
              {expandedItems.has(item.id) && (
                <div className="space-y-1">
                  {item.children.map(child => renderNavigationItem(child, 1))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}; 