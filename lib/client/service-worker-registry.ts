"use client";

/**
 * Type definition for the message event from the service worker
 */

// Cache name used by the service worker
const CACHE_NAME = "scorm-cache-v1";

export interface ScormServiceWorkerMessage {
  type: 
    | 'extraction_complete' 
    | 'extraction_progress' 
    | 'extraction_error' 
    | 'invalidation_complete' 
    | 'invalidation_error';
  key?: string;
  scormObj?: {
    version: string;
    resources: any[];
    PREFIX: string;
  };
  status?: string;
  stage?: string;
  progress?: number;
  error?: string;
  fileList?: string[];
  originalUrl?: string;
  totalSize?: number;
  processedFiles?: number;
  fileCount?: number;
  elapsedTime?: number;
  startTime?: number;
  timings?: {
    download?: number;
    processing?: number;
    extraction?: number;
    total?: number;
  };
}

/**
 * Type for message handler functions
 */
export type ServiceWorkerMessageHandler = (event: MessageEvent<ScormServiceWorkerMessage>) => void;

/**
 * Enhanced progress information
 */
export interface ProgressInfo {
  progress: number;
  stage?: string;
  status?: string;
  totalSize?: number;
  processedFiles?: number;
  fileCount?: number;
  elapsedTime?: number;
}

/**
 * Type for progress callback functions
 */
export type ProgressCallback = (progress: number, info?: ProgressInfo) => void;

/**
 * Result of a SCORM extraction operation
 */
export interface ScormExtractionResult {
  success: boolean;
  key: string;
  scormObj?: {
    version: string;
    resources: any[];
    PREFIX?: string;
    entryPoint?: string;
  };
  fileList?: string[];
  error?: string;
}

/**
 * Check if service workers are supported in this browser
 * @returns true if service workers are supported
 */
export function isServiceWorkerSupported(): boolean {
  return 'serviceWorker' in navigator && 
         'ServiceWorkerRegistration' in window;
}

/**
 * Register the SCORM service worker
 * @param serviceWorkerUrl URL to the service worker script
 * @returns Promise resolving to the service worker registration or null if not supported
 */
export async function registerScormServiceWorker(
  serviceWorkerUrl = '/service-worker-scorm.js',
  options = { scope: '/' }
): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    console.warn('Service Worker not supported in this browser.');
    return null;
  }
  
  try {
    const registration = await navigator.serviceWorker.register(serviceWorkerUrl, options);
    console.log('SCORM Service Worker registered successfully:', registration);
    
    // Wait for the service worker to be activated
    if (registration.installing) {
      await waitForServiceWorkerState(registration.installing, 'activated');
    }
    
    return registration;
  } catch (error) {
    console.error('SCORM Service Worker registration failed:', error);
    return null;
  }
}

/**
 * Wait for a service worker to reach a specific state
 * @param serviceWorker The service worker to wait for
 * @param targetState The state to wait for
 * @returns Promise that resolves when the state is reached
 */
export function waitForServiceWorkerState(
  serviceWorker: ServiceWorker,
  targetState: ServiceWorkerState
): Promise<void> {
  return new Promise((resolve) => {
    if (serviceWorker.state === targetState) {
      resolve();
      return;
    }

    const stateChangeHandler = () => {
      if (serviceWorker.state === targetState) {
        serviceWorker.removeEventListener('statechange', stateChangeHandler);
        resolve();
      }
    };

    serviceWorker.addEventListener('statechange', stateChangeHandler);
  });
}

/**
 * Extract a SCORM package using the service worker
 * @param url URL of the SCORM package
 * @param key Optional key to identify the package
 * @returns Promise that resolves when the extraction is complete
 */
export async function extractScormPackage(
  url: string, 
  key?: string
): Promise<void> {
  if (!isServiceWorkerSupported() || !navigator.serviceWorker.controller) {
    throw new Error('Service Worker not supported or not controlling this page.');
  }

  navigator.serviceWorker.controller.postMessage({
    type: 'extract',
    url,
    key
  });
}

/**
 * Extract a SCORM package and wait for completion
 * @param url URL of the SCORM package
 * @param key Optional key to identify the package
 * @param onProgress Optional progress callback
 * @param timeout Optional timeout in ms (default: 300000ms/5min)
 * @returns Promise resolving to the extraction result
 */
export async function extractAndWaitForCompletion(
  url: string,
  key?: string,
  onProgress?: ProgressCallback,
  timeout = 300000
): Promise<ScormExtractionResult> {
  const actualKey = key || createKeyFromUrl(url);

  console.log(`[Registry DEBUG] Starting extraction with key: ${actualKey}`);

  // First check if this package is already cached
  const isCached = await isScormPackageCached(actualKey);
  if (isCached) {
    console.log(`[Registry DEBUG] SCORM package ${actualKey} found in cache, skipping extraction`);
    
    // Try to fetch the file list from cache
    try {
      const cache = await caches.open(CACHE_NAME);
      const fileListUrl = `/__scorm__/${actualKey}/__scorm__/fileList.json`;
      const fileListResponse = await cache.match(fileListUrl);
      
      if (fileListResponse) {
        const fileList = await fileListResponse.json();
        console.log(`Found cached file list with ${fileList.length} files`);
        
        // Attempt to find imsmanifest.xml in the file list
        if (fileList.includes('imsmanifest.xml')) {
          // Fetch the manifest to get SCORM version and structure
          const manifestUrl = `/__scorm__/${actualKey}/__scorm__/imsmanifest.xml`;
          const manifestResponse = await fetch(manifestUrl);
          
          if (manifestResponse.ok) {
            console.log(`Successfully fetched cached manifest`);
            // Here we'd normally parse the manifest, but for now we'll just return success
            return {
              success: true,
              key: actualKey,
              fileList,
              scormObj: {
                version: "unknown", // We could parse the XML for the exact version
                resources: [],
                // Try to find a potential entry point
                entryPoint: findEntryPoint(fileList)
              }
            };
          }
        }
        
        // Even if we can't parse the manifest, return success with the file list
        return {
          success: true,
          key: actualKey,
          fileList,
          scormObj: {
            version: "unknown",
            resources: [],
            entryPoint: findEntryPoint(fileList)
          }
        };
      }
    } catch (error) {
      console.warn("Error getting cached file list, continuing with extraction:", error);
      // Fall through to normal extraction if anything fails
    }
  }

  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | null = null;
    let cleanup: (() => void) | null = null;
    
    // Track when the last progress update was received
    let lastProgressTime = Date.now();
    let receivedProgressUpdates = 0;
    let currentStage = "initializing";

    // Set timeout
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        if (cleanup) cleanup();
        console.error(`[Registry DEBUG] Extraction timed out after ${timeout}ms - received ${receivedProgressUpdates} progress updates, last stage: ${currentStage}`);
        reject(new Error(`SCORM extraction timed out after ${timeout}ms (last stage: ${currentStage})`));
      }, timeout);
    }

    // Listen for messages
    cleanup = addServiceWorkerMessageListener((event) => {
      const data = event.data;

      // Debug all received messages
      console.log(`[Registry DEBUG] Received message from service worker:`, 
        { 
          type: data.type, 
          key: data.key, 
          hasProgress: typeof data.progress === 'number', 
          stage: data.stage || data.status,
          fileCount: data.fileCount,
          processedFiles: data.processedFiles
        });

      // Only process messages related to this extraction
      if (data.key !== actualKey) {
        console.log(`[Registry DEBUG] Ignoring message for key ${data.key}, waiting for ${actualKey}`);
        return;
      }

      if (data.type === 'extraction_progress' && onProgress && typeof data.progress === 'number') {
        const now = Date.now();
        receivedProgressUpdates++;
        
        // Update current stage tracking
        currentStage = data.stage || data.status || currentStage;
        
        // Create enhanced progress info object
        const progressInfo: ProgressInfo = {
          progress: data.progress,
          stage: data.stage,
          status: data.status,
          totalSize: data.totalSize,
          processedFiles: data.processedFiles,
          fileCount: data.fileCount,
          elapsedTime: data.elapsedTime
        };
        
        console.log(
          `[Registry DEBUG] Progress update #${receivedProgressUpdates}: ` +
          `${Math.round(data.progress * 100)}%, stage: ${currentStage}, ` +
          `time since last update: ${now - lastProgressTime}ms, ` +
          (data.fileCount ? `${data.processedFiles || 0}/${data.fileCount} files, ` : '') +
          (data.elapsedTime ? `total elapsed: ${Math.round(data.elapsedTime / 1000)}s` : '')
        );
        
        lastProgressTime = now;
        
        // Call the progress callback with the enhanced information
        // For backward compatibility, provide the basic progress value first
        // and the enhanced info as an optional second parameter
        onProgress(data.progress, progressInfo);
      } else if (data.type === 'extraction_complete') {
        console.log(`[Registry DEBUG] Extraction complete for ${actualKey}, received ${receivedProgressUpdates} progress updates`);
        
        // If timings are available, log them
        if (data.timings) {
          console.log(`[Registry DEBUG] Extraction timing: download=${data.timings.download}ms, processing=${data.timings.processing}ms, extraction=${data.timings.extraction}ms, total=${data.timings.total}ms`);
        }
        
        if (timeoutId) clearTimeout(timeoutId);
        if (cleanup) cleanup();
        resolve({
          success: true,
          key: actualKey,
          scormObj: data.scormObj,
          fileList: data.fileList
        });
      } else if (data.type === 'extraction_error') {
        console.error(`[Registry DEBUG] Extraction error for ${actualKey}:`, data.error);
        if (timeoutId) clearTimeout(timeoutId);
        if (cleanup) cleanup();
        resolve({
          success: false,
          key: actualKey,
          error: data.error
        });
      }
    });

    // Start the extraction
    try {
      console.log(`[Registry DEBUG] Sending extraction request to service worker for ${url}`);
      extractScormPackage(url, actualKey);
    } catch (error) {
      console.error(`[Registry DEBUG] Error sending extraction request:`, error);
      if (timeoutId) clearTimeout(timeoutId);
      if (cleanup) cleanup();
      reject(error);
    }
  });
}

/**
 * Find a potential entry point from a file list
 * @param fileList List of files in the package
 * @returns Most likely entry point file path
 */
function findEntryPoint(fileList: string[]): string | undefined {
  if (!fileList || !Array.isArray(fileList) || fileList.length === 0) {
    return undefined;
  }
  
  // Common entry point filenames in order of likelihood
  const commonEntryPoints = [
    "index.html",
    "story.html",
    "launch.html",
    "player.html",
    "scormcontent/index.html",
    "scormdriver/indexAPI.html",
    "scormRLO.htm",
    "index.htm",
    "start.html"
  ];
  
  // Try to find any of the common entry points
  for (const entry of commonEntryPoints) {
    if (fileList.includes(entry)) {
      return entry;
    }
  }
  
  // If no common entry point, look for any HTML file
  const htmlFile = fileList.find(file => 
    file.endsWith('.html') || file.endsWith('.htm')
  );
  
  return htmlFile;
}

/**
 * Check if a SCORM package is already cached
 * @param key Key of the package to check
 * @returns Promise resolving to true if the package is cached
 */
export async function isScormPackageCached(key: string): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    return false;
  }

  try {
    // Request the file list, which should be available if the package is cached
    const url = `/__scorm__/${key}/__scorm__/fileList.json`;
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(new Request(url));
    
    return cachedResponse !== undefined;
  } catch (error) {
    console.error('Error checking for cached SCORM package:', error);
    return false;
  }
}

/**
 * Create a key from a URL for use with the service worker
 * @param url URL to convert to a key
 * @returns Safe string key
 */
export function createKeyFromUrl(url: string): string {
  return url
    .replace(/([^\w ]|_)/g, "")
    .slice(0, 50);
}

/**
 * Invalidate a cached SCORM package
 * @param key Key of the package to invalidate
 * @returns Promise that resolves when invalidation is complete
 */
export async function invalidateScormPackage(key: string): Promise<void> {
  if (!isServiceWorkerSupported() || !navigator.serviceWorker.controller) {
    throw new Error('Service Worker not supported or not controlling this page.');
  }

  navigator.serviceWorker.controller.postMessage({
    type: 'invalidate',
    key
  });
}

/**
 * Add a message listener for service worker events
 * @param handler Function to handle service worker messages
 * @returns Function to remove the listener
 */
export function addServiceWorkerMessageListener(
  handler: ServiceWorkerMessageHandler
): () => void {
  if (!isServiceWorkerSupported()) {
    console.warn('[Registry DEBUG] Service Worker not supported in this browser.');
    return () => {};
  }

  const wrappedHandler = (event: MessageEvent) => {
    // Only forward SCORM-related messages
    if (event.data && 
        typeof event.data === 'object' && 
        ('type' in event.data) &&
        typeof event.data.type === 'string' &&
        (event.data.type.startsWith('extraction_') || 
         event.data.type.startsWith('invalidation_'))) {
      
      // Validate and normalize message data to ensure it conforms to our expected format
      try {
        // Ensure we have at least the required fields for all message types
        const validatedData: ScormServiceWorkerMessage = {
          type: event.data.type as ScormServiceWorkerMessage['type'],
          key: event.data.key
        };
        
        // Copy over additional fields based on message type
        if (event.data.type === 'extraction_progress') {
          validatedData.progress = typeof event.data.progress === 'number' ? 
            Math.max(0, Math.min(1, event.data.progress)) : 0; // Normalize to 0-1
          validatedData.status = event.data.status;
          validatedData.stage = event.data.stage || event.data.status;
          
          // Copy additional progress information if available
          if (typeof event.data.totalSize === 'number') validatedData.totalSize = event.data.totalSize;
          if (typeof event.data.processedFiles === 'number') validatedData.processedFiles = event.data.processedFiles;
          if (typeof event.data.fileCount === 'number') validatedData.fileCount = event.data.fileCount;
          if (typeof event.data.elapsedTime === 'number') validatedData.elapsedTime = event.data.elapsedTime;
          if (typeof event.data.startTime === 'number') validatedData.startTime = event.data.startTime;
          if (event.data.timings) validatedData.timings = event.data.timings;
        } else if (event.data.type === 'extraction_complete') {
          validatedData.scormObj = event.data.scormObj;
          validatedData.fileList = event.data.fileList;
          validatedData.originalUrl = event.data.originalUrl;
          if (event.data.timings) validatedData.timings = event.data.timings;
        } else if (event.data.type === 'extraction_error') {
          validatedData.error = event.data.error || 'Unknown error';
        }
        
        // Log all incoming service worker messages
        console.log(`[Registry DEBUG] Raw service worker message received:`, validatedData);
        
        // Create a new event with validated data to ensure type safety
        const validatedEvent = new MessageEvent('message', {
          data: validatedData
        });
        
        handler(validatedEvent as MessageEvent<ScormServiceWorkerMessage>);
      } catch (error) {
        console.error('[Registry DEBUG] Error processing service worker message:', error, event.data);
      }
    }
  };

  navigator.serviceWorker.addEventListener('message', wrappedHandler);

  // Return a function to remove the listener
  return () => {
    navigator.serviceWorker.removeEventListener('message', wrappedHandler);
  };
}

/**
 * Get the active service worker registration if available
 * @returns Promise resolving to the active service worker registration or null
 */
export async function getActiveScormServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    return null;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    // Find our SCORM service worker
    const scormRegistration = registrations.find(registration => 
      registration.active && 
      registration.active.scriptURL.includes('service-worker-scorm.js')
    );
    
    return scormRegistration || null;
  } catch (error) {
    console.error('Error getting SCORM service worker registration:', error);
    return null;
  }
}

/**
 * Update the service worker if an update is available
 * @returns Promise resolving to true if an update was found and activated
 */
export async function updateScormServiceWorker(): Promise<boolean> {
  const registration = await getActiveScormServiceWorker();
  
  if (!registration) {
    return false;
  }

  try {
    // Check for updates
    await registration.update();
    
    if (registration.waiting) {
      // Force the waiting service worker to become active
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      
      // Wait for the new service worker to activate
      await new Promise<void>((resolve) => {
        const onControllerChange = () => {
          navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
          resolve();
        };
        
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      });
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error updating SCORM service worker:', error);
    return false;
  }
}

/**
 * Check if a service worker is currently controlling this page
 * @returns true if there is an active service worker controller
 */
export function hasActiveServiceWorkerController(): boolean {
  return isServiceWorkerSupported() && 
         navigator.serviceWorker.controller !== null;
}

/**
 * Get the URL for a SCORM file from a package
 * @param key The package key
 * @param filePath The path to the file within the package
 * @returns URL to the file served through the service worker
 */
export function getScormFileUrl(key: string, filePath: string): string {
  console.log(`[Registry DEBUG] Getting URL for file: ${filePath} in package: ${key}`);
  return `/__scorm__/${key}/__scorm__/${filePath}`;
} 