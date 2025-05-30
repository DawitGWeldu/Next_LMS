"use client";

import JSZip from 'jszip';
import { ScormManifest, ScormVersion } from '@/lib/scorm';
import { determineScormVersionFromContent, parseManifestContent } from './scorm-manifest-parser';

/**
 * Represents an extracted SCORM package with its contents and metadata
 */
export interface ExtractedScormPackage {
  /**
   * The parsed manifest data
   */
  manifest: ScormManifest;
  
  /**
   * Map of file paths to their blob contents
   */
  files: Map<string, Blob>;
  
  /**
   * Original URL of the SCORM package
   */
  originalUrl: string;
  
  /**
   * Timestamp when the package was extracted
   */
  extractedAt: number;
  
  /**
   * Version of the SCORM package
   */
  version: ScormVersion;
}

/**
 * Progress callback for download and extraction operations
 */
export type ProgressCallback = (progress: number) => void;

/**
 * JSZip metadata for progress events
 */
interface JSZipMetadata {
  percent: number;
  currentFile: string | null;
}

/**
 * Downloads a SCORM package from a URL and extracts it using JSZip
 * 
 * @param url URL of the SCORM package
 * @param onProgress Optional callback for progress updates
 * @returns Promise resolving to the extracted package data
 */
export async function downloadAndExtractScorm(
  url: string,
  onProgress?: ProgressCallback
): Promise<ExtractedScormPackage> {
  try {
    // Check for empty URL
    if (!url || url.trim() === "") {
      throw new Error('Empty URL provided for SCORM package download');
    }
    
    // Report initial progress
    onProgress?.(0);
    
    console.log("Downloading SCORM package from:", url);
    
    // Ensure URL is absolute
    let absoluteUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
      absoluteUrl = '/' + url;
      console.log("Converting to absolute URL:", absoluteUrl);
    }
    
    // Use a simpler approach to fetch the file directly as a blob
    // This avoids issues with manually chunking the response
    const response = await fetch(absoluteUrl, {
      method: 'GET',
      credentials: 'same-origin', // Include cookies for same-origin requests
    });
    
    if (!response.ok) {
      throw new Error(`Failed to download SCORM package: ${response.status} ${response.statusText}`);
    }
    
    // Log response details for debugging
    console.log("SCORM download response:", {
      status: response.status,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
    });
    
    // Get the file directly as a blob
    const blob = await response.blob();
    
    // Report extraction start
    onProgress?.(0.5); // 50% - download complete, extraction starting
    
    console.log("Downloaded SCORM package, size:", blob.size, "bytes, type:", blob.type);
    
    // If blob type is text/html, we likely got an error page instead of a ZIP
    if (blob.type === "text/html") {
      const textContent = await blob.text();
      console.error("Received HTML instead of ZIP file. First 200 chars:", textContent.substring(0, 200));
      throw new Error("Received HTML content instead of a ZIP file. The URL may be incorrect or require authentication.");
    }
    
    // Load the zip file
    const zip = await JSZip.loadAsync(blob);
    
    // Check for imsmanifest.xml
    const manifestFile = zip.file('imsmanifest.xml');
    if (!manifestFile) {
      throw new Error('Invalid SCORM package: Missing imsmanifest.xml file');
    }
    
    // Read the manifest content
    const manifestContent = await manifestFile.async('string');
    
    // Determine SCORM version
    const version = determineScormVersionFromContent(manifestContent);
    
    if (version === 'unknown') {
      throw new Error('Invalid SCORM package: Unable to determine SCORM version');
    }
    
    // Parse the manifest
    const manifest = await parseManifestContent(manifestContent);
    
    // Extract all files
    const files = new Map<string, Blob>();
    const zipFiles = Object.keys(zip.files);
    const totalFiles = zipFiles.length;
    let processedFiles = 0;
    
    for (const filename of zipFiles) {
      const zipEntry = zip.file(filename);
      
      // Skip directories
      if (zipEntry && !zipEntry.dir) {
        const content = await zipEntry.async('blob');
        files.set(filename, content);
      }
      
      // Update extraction progress
      processedFiles++;
      onProgress?.(0.5 + (processedFiles / totalFiles * 0.5)); // Last 50% for extraction
    }
    
    // Report completion
    onProgress?.(1);
    
    return {
      manifest,
      files,
      originalUrl: url,
      extractedAt: Date.now(),
      version
    };
  } catch (error) {
    console.error("SCORM extraction error:", error);
    throw new Error(`SCORM extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Extracts a SCORM package from a File object
 * 
 * @param file SCORM zip file
 * @param onProgress Optional callback for progress updates
 * @returns Promise resolving to the extracted package data
 */
export async function extractScormFromFile(
  file: File,
  onProgress?: ProgressCallback
): Promise<ExtractedScormPackage> {
  try {
    // Report initial progress
    onProgress?.(0);
    
    // Load the zip file
    const zip = await JSZip.loadAsync(file);
    
    // Set up a separate progress handler
    let lastProgressUpdate = 0;
    const updateProgress = (percent: number) => {
      // Throttle progress updates to avoid excessive callbacks
      const now = Date.now();
      if (now - lastProgressUpdate > 100 || percent >= 100) {
        onProgress?.(percent / 200); // First 50% for loading
        lastProgressUpdate = now;
      }
    };
    
    // Check for imsmanifest.xml
    const manifestFile = zip.file('imsmanifest.xml');
    if (!manifestFile) {
      throw new Error('Invalid SCORM package: Missing imsmanifest.xml file');
    }
    
    // Read the manifest content
    const manifestContent = await manifestFile.async('string', (metadata: JSZipMetadata) => {
      updateProgress(metadata.percent);
    });
    
    // Determine SCORM version
    const version = determineScormVersionFromContent(manifestContent);
    
    if (version === 'unknown') {
      throw new Error('Invalid SCORM package: Unable to determine SCORM version');
    }
    
    // Parse the manifest
    const manifest = await parseManifestContent(manifestContent);
    
    // Extract all files
    const files = new Map<string, Blob>();
    const zipFiles = Object.keys(zip.files);
    const totalFiles = zipFiles.length;
    let processedFiles = 0;
    
    for (const filename of zipFiles) {
      const zipEntry = zip.file(filename);
      
      // Skip directories
      if (zipEntry && !zipEntry.dir) {
        const content = await zipEntry.async('blob', (metadata: JSZipMetadata) => {
          // Update extraction progress for this file
          updateProgress(100 + (metadata.percent * processedFiles / totalFiles));
        });
        files.set(filename, content);
      }
      
      // Update extraction progress
      processedFiles++;
      onProgress?.(0.5 + (processedFiles / totalFiles * 0.5)); // Last 50% for extraction
    }
    
    // Report completion
    onProgress?.(1);
    
    return {
      manifest,
      files,
      originalUrl: URL.createObjectURL(file), // Create a temporary URL for the file
      extractedAt: Date.now(),
      version
    };
  } catch (error) {
    throw new Error(`SCORM extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Process HTML content to ensure it works correctly in the iframe
 * By adding a base tag if needed and ensuring relative links work
 * 
 * @param content The HTML content as a string
 * @param filePath The path of the file in the package
 * @returns Modified HTML content
 */
function processHtmlContent(content: string, filePath: string): string {
  // If this isn't HTML content, return as is
  if (!(filePath.toLowerCase().endsWith('.htm') || filePath.toLowerCase().endsWith('.html'))) {
    return content;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    
    // Check if there's already a base tag
    let baseTag = doc.querySelector('base');
    
    // If no base tag exists, create one and add it to the head
    if (!baseTag) {
      baseTag = doc.createElement('base');
      const head = doc.querySelector('head');
      
      if (head) {
        // Add base tag as the first element in head
        head.insertBefore(baseTag, head.firstChild);
      }
    }
    
    // Calculate the directory path for the base URL
    const pathParts = filePath.split('/');
    pathParts.pop(); // Remove the filename
    const basePath = pathParts.join('/');
    
    // Update base href attribute
    baseTag.setAttribute('href', `${basePath}/`);
    
    // Add a meta tag to ensure proper viewport scaling
    const viewportMeta = doc.querySelector('meta[name="viewport"]');
    if (!viewportMeta) {
      const metaTag = doc.createElement('meta');
      metaTag.setAttribute('name', 'viewport');
      metaTag.setAttribute('content', 'width=device-width, initial-scale=1.0');
      const head = doc.querySelector('head');
      if (head) {
        head.appendChild(metaTag);
      }
    }
    
    // Convert the document back to HTML string
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  } catch (error) {
    console.error('Error processing HTML content:', error);
    return content; // Return original content if processing fails
  }
}

/**
 * Creates an object URL for a file in an extracted SCORM package
 * 
 * @param extractedPackage The extracted SCORM package
 * @param filePath Path to the file within the package
 * @returns Promise resolving to an object URL for the file, or null if not found
 */
export function createFileObjectURL(
  extractedPackage: ExtractedScormPackage,
  filePath: string
): Promise<string | null> {
  const file = extractedPackage.files.get(filePath);
  if (!file) {
    return Promise.resolve(null);
  }
  
  // Determine the correct MIME type based on file extension
  let contentType = file.type;
  
  // Ensure proper MIME type for HTML files to prevent display as text
  if (filePath.toLowerCase().endsWith('.htm') || filePath.toLowerCase().endsWith('.html')) {
    contentType = 'text/html';
    
    // For HTML files, process the content to ensure links work properly
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        const processedContent = processHtmlContent(content, filePath);
        const processedBlob = new Blob([processedContent], { type: contentType });
        resolve(URL.createObjectURL(processedBlob));
      };
      reader.readAsText(file);
    }).catch(err => {
      console.error("Error processing HTML content:", err);
      // Fallback to original file if processing fails
      const newBlob = new Blob([file], { type: contentType });
      return URL.createObjectURL(newBlob);
    });
  } else if (!contentType || contentType === 'application/octet-stream') {
    // Set appropriate MIME types for common file extensions
    if (filePath.toLowerCase().endsWith('.js')) contentType = 'application/javascript';
    else if (filePath.toLowerCase().endsWith('.css')) contentType = 'text/css';
    else if (filePath.toLowerCase().endsWith('.jpg') || filePath.toLowerCase().endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (filePath.toLowerCase().endsWith('.png')) contentType = 'image/png';
    else if (filePath.toLowerCase().endsWith('.gif')) contentType = 'image/gif';
    else if (filePath.toLowerCase().endsWith('.svg')) contentType = 'image/svg+xml';
    else if (filePath.toLowerCase().endsWith('.xml')) contentType = 'application/xml';
    else if (filePath.toLowerCase().endsWith('.json')) contentType = 'application/json';
  }
  
  // Create a new blob with the correct content type
  const newBlob = new Blob([file], { type: contentType });
  return Promise.resolve(URL.createObjectURL(newBlob));
}

/**
 * Revokes all object URLs for an extracted SCORM package to prevent memory leaks
 * 
 * @param extractedPackage The extracted SCORM package
 */
export function revokeAllObjectURLs(extractedPackage: ExtractedScormPackage): void {
  // If the original URL is an object URL, revoke it
  if (extractedPackage.originalUrl.startsWith('blob:')) {
    URL.revokeObjectURL(extractedPackage.originalUrl);
  }
}