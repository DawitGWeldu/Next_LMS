"use client";

// Extend Window interface to allow our custom property
declare global {
  interface Window {
    __templateXmlPath?: string;
  }
}

import { 
  createContext, 
  useContext, 
  useState, 
  useEffect, 
  useRef, 
  useCallback,
  ReactNode 
} from 'react';
import { toast } from 'react-hot-toast';
import { 
  downloadAndExtractScorm, 
  extractScormFromFile,
  ExtractedScormPackage,
  revokeAllObjectURLs 
} from '@/lib/client/scorm-extractor';
import { getScormPackage, storeScormPackage } from '@/lib/client/scorm-cache';
import { buildNavigationTree, NavigationItem, navigateToItem, NavigationResult } from '@/lib/client/scorm-navigation';

// Function to handle common SCORM content loading issues
function patchScormContentIssues() {
  console.log("Adding SCORM content workarounds and patches");
  
  // Template.xml issue workaround - catch AJAX requests for template.xml
  const originalFetch = window.fetch;
  window.fetch = async function(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input instanceof Request ? input.url : '';
    
    if (url.includes('template.xml')) {
      console.log('Intercepting template.xml request:', url);
      // Try to get the correct path from the service worker
      const response = await originalFetch(input, init);
      if (!response.ok && response.status === 404) {
        console.log('template.xml not found, trying to find alternative location');
        
        // Try to get the file list from service worker
        try {
          const path = url.split('/__scorm__/')[1];
          if (path) {
            const parts = path.split('/');
            const key = parts[0];
            
            // Construct fileList URL
            const fileListUrl = `/__scorm__/${key}/__scorm__/fileList.json`;
            const fileListResponse = await originalFetch(fileListUrl);
            
            if (fileListResponse.ok) {
              const fileList = await fileListResponse.json() as string[];
              
              // Find template.xml in the file list
              const templateFile = fileList.find((file: string) => 
                file.endsWith('template.xml') || file.includes('/template.xml')
              );
              
              if (templateFile) {
                console.log('Found template.xml at:', templateFile);
                // Try to fetch from the correct location
                const correctUrl = `/__scorm__/${key}/__scorm__/${templateFile}`;
                return originalFetch(correctUrl, init);
              }
            }
          }
        } catch (error) {
          console.error('Error trying to fix template.xml request:', error);
        }
      }
      return response;
    }
    
    // For all other requests, proceed normally
    return originalFetch(input, init);
  };
  
  // Also patch XMLHttpRequest for jQuery AJAX
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(
    this: XMLHttpRequest,
    method: string, 
    url: string | URL, 
    async: boolean = true, 
    username?: string | null, 
    password?: string | null
  ) {
    if (typeof url === 'string' && url.includes('template.xml')) {
      console.log('Intercepting XHR request for template.xml:', url);
      
      // We can't easily modify the URL for an existing XHR,
      // but we can inject a workaround for when it fails
      this.addEventListener('load', function() {
        if (this.status === 404) {
          console.log('XHR template.xml not found, injecting fallback handler');
          
          // Trigger a special event that our code can listen for
          const event = new CustomEvent('templateXmlNotFound', { 
            detail: { originalUrl: url }
          });
          document.dispatchEvent(event);
        }
      });
    }
    
    return originalOpen.call(this, method, url, async, username, password);
  };
  
  // Define the type for our custom event
  type TemplateXmlEvent = CustomEvent<{ originalUrl: string }>;
  
  // Add template listener to the document
  document.addEventListener('templateXmlNotFound', async (e: Event) => {
    const event = e as TemplateXmlEvent;
    const originalUrl = event.detail?.originalUrl;
    if (originalUrl && originalUrl.includes('/__scorm__/')) {
      console.log('Handling template.xml not found event:', originalUrl);
      
      try {
        const path = originalUrl.split('/__scorm__/')[1];
        if (path) {
          const parts = path.split('/');
          const key = parts[0];
          
          // Construct fileList URL
          const fileListUrl = `/__scorm__/${key}/__scorm__/fileList.json`;
          const fileListResponse = await fetch(fileListUrl);
          
          if (fileListResponse.ok) {
            const fileList = await fileListResponse.json() as string[];
            
            // Find template.xml in the file list
            const templateFile = fileList.find((file: string) => 
              file.endsWith('template.xml') || file.includes('/template.xml')
            );
            
            if (templateFile) {
              console.log('Found template.xml at:', templateFile);
              
              // Inject a global variable that the SCORM content might check
              const templatePath = `/__scorm__/${key}/__scorm__/${templateFile}`;
              window.__templateXmlPath = templatePath;
              
              // Try to notify the content that we found the template
              const foundEvent = new CustomEvent('templateXmlFound', { 
                detail: { path: templatePath }
              });
              document.dispatchEvent(foundEvent);
            }
          }
        }
      } catch (error) {
        console.error('Error in templateXmlNotFound handler:', error);
      }
    }
  });
}

/**
 * Type definition for SCORM content context
 */
interface ScormContentContextType {
  /**
   * The extracted SCORM package data
   */
  scormPackage: ExtractedScormPackage | null;
  
  /**
   * Navigation tree built from the SCORM package
   */
  navigationTree: NavigationItem[];
  
  /**
   * Whether content is currently loading
   */
  isLoading: boolean;
  
  /**
   * Current extraction progress (0-1)
   */
  extractionProgress: number;
  
  /**
   * Error that occurred during loading, if any
   */
  error: Error | null;
  
  /**
   * Navigate to a specific item in the SCORM package
   */
  navigateToItem: (itemId: string) => Promise<NavigationResult | null>;
  
  /**
   * Current item ID being displayed
   */
  currentItemId: string | null;
  
  /**
   * Set the current item ID
   */
  setCurrentItemId: (itemId: string | null) => void;
  
  /**
   * Clear loaded content and object URLs
   */
  clearContent: () => void;

  /**
   * The main SCORM package URL provided to the provider
   */
  mainScormUrl: string;
}

/**
 * Context for sharing SCORM content between components
 */
const ScormContentContext = createContext<ScormContentContextType | null>(null);

/**
 * Props for the ScormContentProvider component
 */
interface ScormContentProviderProps {
  /**
   * Child components that will have access to the SCORM content
   */
  children: ReactNode;
  
  /**
   * URL of the SCORM package to load
   */
  scormUrl: string;
  
  /**
   * Unique identifier for the course (for caching)
   */
  courseId: string;
  
  /**
   * File object if directly uploading a SCORM package
   */
  scormFile?: File;
  
  /**
   * Initial item ID to navigate to
   */
  initialItemId?: string;
}

/**
 * Provider component for sharing SCORM content between components
 */
export function ScormContentProvider({ 
  children, 
  scormUrl, 
  courseId, 
  scormFile,
  initialItemId 
}: ScormContentProviderProps) {
  const [scormPackage, setScormPackage] = useState<ExtractedScormPackage | null>(null);
  const [navigationTree, setNavigationTree] = useState<NavigationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [currentItemId, setCurrentItemId] = useState<string | null>(initialItemId || null);
  
  // Use a reference to check if the component is mounted
  const isMounted = useRef(true);
  
  // Use a reference to keep track of the current package for cleanup
  const currentPackageRef = useRef<ExtractedScormPackage | null>(null);
  
  // Update the ref when the state changes
  useEffect(() => {
    currentPackageRef.current = scormPackage;
  }, [scormPackage]);
  
  // Generate a cache key from the URL and courseId
  const cacheKey = useCallback(() => {
    return `scorm-${courseId}-${encodeURIComponent(scormUrl)}`;
  }, [courseId, scormUrl]);

  // Function to clear content and revoke object URLs
  const clearContent = useCallback(() => {
    if (currentPackageRef.current) {
      revokeAllObjectURLs(currentPackageRef.current);
    }
    
    setScormPackage(null);
    setNavigationTree([]);
    setCurrentItemId(null);
  }, []);

  // // Load SCORM content
  // useEffect(() => {
  //   if (!isMounted.current) return;
    
  //   // Early return if scormUrl is empty
  //   if (!scormUrl) {
  //     console.error("No SCORM URL provided");
  //     setError(new Error("No SCORM URL provided"));
  //     setIsLoading(false);
  //     return;
  //   }
    
  //   // Apply SCORM content patches
  //   patchScormContentIssues();
    
  //   // Skip if we already have a package loaded with the same URL
  //   if (currentPackageRef.current && currentPackageRef.current.originalUrl === scormUrl) {
  //     console.log("Package already loaded, skipping re-download");
  //     return;
  //   }
    
  //   console.log("ScormContentProvider: Loading content from URL:", scormUrl);
    
  //   const loadScormContent = async () => {
  //     // Helper function to clean up previous content
  //     const cleanupPreviousContent = () => {
  //       if (currentPackageRef.current) {
  //         revokeAllObjectURLs(currentPackageRef.current);
  //       }
  //     };
      
  //     try {
  //       setIsLoading(true);
  //       setError(null);
        
  //       // Clean up previous content if any
  //       cleanupPreviousContent();
        
  //       // Handle direct file upload
  //       if (scormFile) {
  //         console.log("Extracting SCORM from file");
  //         const extracted = await extractScormFromFile(scormFile, (progress) => {
  //           if (isMounted.current) {
  //             setExtractionProgress(progress);
  //           }
  //         });
          
  //         if (isMounted.current) {
  //           setScormPackage(extracted);
  //           const navTree = buildNavigationTree(extracted);
  //           setNavigationTree(navTree);
  //         }
  //       } else {
          // Handle URL-based content (with caching)
    //       const key = cacheKey();
          
    //       // Try to get from cache first
    //       const cachedPackage = await getScormPackage(key);
          
    //       let extractedPackage: ExtractedScormPackage;
          
    //       if (cachedPackage) {
    //         console.log("Using cached SCORM package");
    //         extractedPackage = cachedPackage;
    //       } else {
    //         console.log("Downloading and extracting SCORM package from:", scormUrl);
            
    //         // Download and extract
    //         extractedPackage = await downloadAndExtractScorm(scormUrl, (progress) => {
    //           if (isMounted.current) {
    //             setExtractionProgress(progress);
    //           }
    //         });
            
    //         // Store in cache for future use
    //         await storeScormPackage(key, extractedPackage);
    //       }
          
    //       if (isMounted.current) {
    //         setScormPackage(extractedPackage);
    //         const navTree = buildNavigationTree(extractedPackage);
    //         setNavigationTree(navTree);
    //       }
    //     }
    //   } catch (err) {
    //     console.error("Error loading SCORM content:", err);
    //     if (isMounted.current) {
    //       setError(err instanceof Error ? err : new Error(String(err)));
    //     }
    //   } finally {
    //     if (isMounted.current) {
    //       setIsLoading(false);
    //     }
    //   }
    // };
    
    // loadScormContent();
    
  //   // Cleanup when unmounting or when URL/file changes
  //   return () => {
  //     // Use the local cleanup function to avoid dependency issues
  //     if (currentPackageRef.current) {
  //       revokeAllObjectURLs(currentPackageRef.current);
  //     }
  //   };
  // }, [scormUrl, scormFile, courseId, cacheKey]); // Removed scormPackage dependency to avoid infinite loop

  // Function to navigate to a specific item
  const handleNavigateToItem = useCallback(async (itemId: string): Promise<NavigationResult | null> => {
    if (!scormPackage) {
      return null;
    }
    
    try {
      return navigateToItem(scormPackage, itemId);
    } catch (err) {
      console.error("Error navigating to item:", err);
      toast.error("Failed to navigate to the selected item");
      return null;
    }
  }, [scormPackage]);

  // // Clean up when the component unmounts
  // useEffect(() => {
  //   return () => {
  //     isMounted.current = false;
  //     clearContent();
  //   };
  // }, [clearContent]);

  // The context value
  const contextValue: ScormContentContextType = {
    scormPackage,
    navigationTree,
    isLoading,
    extractionProgress,
    error,
    navigateToItem: handleNavigateToItem,
    currentItemId,
    setCurrentItemId,
    clearContent,
    mainScormUrl: scormUrl
  };
  
  return (
    <ScormContentContext.Provider value={contextValue}>
      {children}
    </ScormContentContext.Provider>
  );
}

/**
 * Hook to access SCORM content from context
 * @returns SCORM content context
 * @throws Error if used outside of a ScormContentProvider
 */
export function useScormContent(): ScormContentContextType {
  const context = useContext(ScormContentContext);
  if (!context) {
    throw new Error('useScormContent must be used within a ScormContentProvider');
  }
  return context;
} 