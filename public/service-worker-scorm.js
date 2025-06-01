/// <reference lib="webworker" />

// Import required modules
importScripts("modules/jszip.js");
importScripts("modules/mimetypes.js");
importScripts("modules/txml.js");

const t_xml = txml();
const FOLDER_PREFIX = "__scorm__";
const CACHE_NAME = "scorm-cache-v1";
const resolvers = {};

// Constants for progress tracking
const PROGRESS_THRESHOLD = 0.01; // Only report 1% changes
const TIME_THRESHOLD = 250; // Or every 250ms
const LOG_THRESHOLD = 0.05; // Only log 5% changes
const LOG_TIME_THRESHOLD = 1000; // Or every 1000ms
const BATCH_SIZE = 10; // Number of files to extract in parallel
const PROGRESS_THROTTLE_MS = 250; // Minimum time between progress updates for extraction

// Variables to track progress reporting
let lastReportedProgress = 0;
let lastReportedTime = 0;
let lastProgressUpdate = 0;

/**
 * Parses the imsmanifest.xml file to extract SCORM metadata
 * @param {string} manifestContent XML content of the manifest file
 * @returns {Object} Parsed SCORM details
 */
function parseManifest(manifestContent) {
  try {
    console.log('Parsing manifest XML');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(manifestContent, 'application/xml');
    
    // Check for parsing errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      console.error('XML parsing error:', parseError.textContent);
      return { version: 'unknown', resources: [], organizations: {}, entryPoint: 'scormRLO.htm' };
    }
    
    console.log('XML parsing successful, extracting details');
    
    // Analyze the structure of the manifest to help with debugging
    const hasManifest = !!xmlDoc.querySelector('manifest');
    const hasOrganizations = !!xmlDoc.querySelector('organizations');
    const hasResources = !!xmlDoc.querySelector('resources');
    const resourceElements = xmlDoc.querySelectorAll('resource');
    const resourceCount = resourceElements.length;
    
    console.log('Manifest structure:', { 
      hasManifest, 
      hasOrganizations, 
      hasResources, 
      resourceCount 
    });
    
    // Determine SCORM version
    let version = 'unknown';
    const schemaVersionElement = xmlDoc.querySelector('schemaversion');
    const metadataSchemaVersionElement = xmlDoc.querySelector('metadata schemaversion');
    
    // Explicitly check for SCORM versions based on namespaces or schema elements
    const scorm12Namespace = xmlDoc.querySelector('manifest[xmlns*="adlcp_rootv1p2"]');
    const scorm2004Namespace = xmlDoc.querySelector('manifest[xmlns*="adlcp_v1p3"]');
    
    if (scorm12Namespace) {
      version = '1.2';
    } else if (scorm2004Namespace) {
      version = '2004';
    } else if (schemaVersionElement) {
      const schemaText = schemaVersionElement.textContent;
      if (schemaText.includes('1.2')) {
        version = '1.2';
      } else if (schemaText.includes('2004') || schemaText.includes('1.3')) {
        version = '2004';
      }
    } else if (metadataSchemaVersionElement) {
      const schemaText = metadataSchemaVersionElement.textContent;
      if (schemaText.includes('1.2')) {
        version = '1.2';
      } else if (schemaText.includes('2004') || schemaText.includes('1.3')) {
        version = '2004';
      }
    }
    
    // Get resource information
    const resources = [];
    resourceElements.forEach(resourceElement => {
      try {
        // Extract all attributes from the resource element
        const resource = {
          type: resourceElement.getAttribute('type'),
          'adlcp:scormtype': resourceElement.getAttribute('adlcp:scormtype') || resourceElement.getAttribute('scormtype'),
          identifier: resourceElement.getAttribute('identifier'),
          href: resourceElement.getAttribute('href') || '',
          file: {
            href: resourceElement.getAttribute('href') || ''
          }
        };
        
        // Get all file elements
        const fileElements = resourceElement.querySelectorAll('file');
        if (fileElements.length > 0) {
          resource.files = Array.from(fileElements).map(fileElement => ({
            href: fileElement.getAttribute('href')
          }));
        }
        
        resources.push(resource);
      } catch (err) {
        console.error('Error processing resource element:', err);
      }
    });
    
    // Find the first SCO resource (for SCORM 1.2) or presentable resource (for SCORM 2004)
    let entryPoint = '';
    let firstResource = null;
    
    // Try to find resources with specific characteristics in order of preference
    const scoResource = resources.find(res => 
      (res['adlcp:scormtype'] === 'sco' || res['adlcp:scormtype'] === 'SCO') && res.href
    );
    
    const assetResource = resources.find(res => 
      (res['adlcp:scormtype'] === 'asset' || res['adlcp:scormtype'] === 'ASSET') && res.href
    );
    
    const anyResourceWithHref = resources.find(res => res.href && res.href.trim() !== '');
    
    firstResource = scoResource || assetResource || anyResourceWithHref || resources[0] || null;
    
    if (firstResource) {
      console.log('First resource:', firstResource);
      // Prioritize href from the resource
      entryPoint = firstResource.href || '';
      
      // If no href, check the file element
      if (!entryPoint && firstResource.file && firstResource.file.href) {
        entryPoint = firstResource.file.href;
      }
      
      // If still no entry point but we have files array, use the first file
      if (!entryPoint && firstResource.files && firstResource.files.length > 0) {
        const firstFileWithHref = firstResource.files.find(f => f && f.href);
        if (firstFileWithHref) {
          entryPoint = firstFileWithHref.href;
        }
      }
    }
    
    // Check for organizations (SCORM 2004)
    const organizations = {};
    const organizationElements = xmlDoc.querySelectorAll('organization');
    let defaultOrganizationIdentifier = '';
    
    // Get the default organization if specified
    const organizationsElement = xmlDoc.querySelector('organizations');
    if (organizationsElement) {
      defaultOrganizationIdentifier = organizationsElement.getAttribute('default') || '';
    }
    
    organizationElements.forEach(orgElement => {
      const orgId = orgElement.getAttribute('identifier') || '';
      const orgTitle = orgElement.querySelector('title')?.textContent || '';
      
      // Add to organizations object
      organizations[orgId] = { title: orgTitle, items: [] };
      
      // Process items (in SCORM these represent the content structure)
      const itemElements = orgElement.querySelectorAll('item');
      itemElements.forEach(itemElement => {
        const itemId = itemElement.getAttribute('identifier') || '';
        const itemTitle = itemElement.querySelector('title')?.textContent || '';
        const itemResourceId = itemElement.getAttribute('identifierref') || '';
        
        organizations[orgId].items.push({
          identifier: itemId,
          title: itemTitle,
          resourceIdentifier: itemResourceId
        });
        
        // If we don't have an entry point yet, try to get it from the first item's resource
        if (!entryPoint && itemResourceId) {
          const linkedResource = resources.find(res => res.identifier === itemResourceId);
          if (linkedResource && linkedResource.href) {
            entryPoint = linkedResource.href;
          }
        }
      });
    });
    
    // If we still don't have an entry point, look for scormRLO.htm or similar
    if (!entryPoint) {
      const commonEntryPoints = ['scormRLO.htm', 'index.html', 'index.htm', 'default.html', 'default.htm', 'start.html', 'start.htm'];
      const foundFile = commonEntryPoints.find(file => 
        resources.some(res => res.href === file) || 
        resources.some(res => res.files && res.files.some(f => f && f.href === file))
      );
      
      if (foundFile) {
        entryPoint = foundFile;
      } else {
        // Default to scormRLO.htm as absolute last resort
        console.log('Using default entry point: scormRLO.htm');
        entryPoint = 'scormRLO.htm';
      }
    } else {
      console.log('Using default entry point:', entryPoint);
    }
    
    console.log('Returning SCORM details:', JSON.stringify({ 
      version, 
      resources: resources.map(r => ({
        identifier: r.identifier || '',
        href: r.href || '',
        type: r.type || '',
        scormType: r['adlcp:scormtype'] || '',
        files: r.files || [null]
      })),
      organizations,
      entryPoint
    }));
    
    return {
      version,
      resources,
      organizations,
      defaultOrganizationIdentifier,
      entryPoint
    };
  } catch (err) {
    console.error('Error parsing manifest:', err);
    return { version: 'unknown', resources: [], organizations: {}, entryPoint: 'scormRLO.htm' };
  }
}

/**
 * Install event handler - activates the service worker immediately
 */
self.addEventListener("install", (event) => {
  console.log("SCORM Service Worker installing...");
  self.skipWaiting(); // Activate immediately after installation
});

/**
 * Activate event handler - claims clients and creates cache
 */
self.addEventListener("activate", (event) => {
  console.log("SCORM Service Worker activated.");
  
  // Ensure the service worker takes control of clients
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Open and initialize cache if needed
      caches.open(CACHE_NAME)
    ])
  );
});

/**
 * Message event handler - processes messages from clients
 */
self.addEventListener("message", async (event) => {
  const { type, url, key } = event.data;
  
  // If this is a package extraction request
  if (type === "extract" && url) {
    const urlKey = key || createKeyFromUrl(url);
    const PREFIX = `${FOLDER_PREFIX}/${urlKey}/${FOLDER_PREFIX}`;
    
    try {
      // Check if already cached first (based on fileList.json)
      const cache = await caches.open(CACHE_NAME);
      const fileListRequest = new Request(`${PREFIX}/fileList.json`);
      const cachedFileList = await cache.match(fileListRequest);
      
      if (cachedFileList) {
        const fileListJson = await cachedFileList.json();
        console.log(`Package ${urlKey} already in cache with ${fileListJson.length} files`);
        
        // Log all XML files in the package for debugging
        const xmlFiles = fileListJson.filter(file => file.endsWith('.xml'));
        console.log(`XML files in package: ${xmlFiles.join(', ')}`);
        
        // Check if we can find the manifest in cache
        const manifestRequest = new Request(`${PREFIX}/imsmanifest.xml`);
        const manifestResponse = await cache.match(manifestRequest);
        let scormObj = null;
        
        if (manifestResponse) {
          try {
            // Parse the manifest
            const xml = await manifestResponse.text();
            scormObj = parseManifest(xml);
            
            // Try to find entry point
            if (!scormObj.entryPoint) {
              // Look for common entry points in file list
              const possibleEntryPoints = [
                "scormRLO.htm", "index.htm", "player.html", 
                "launch.html", "scormdriver/indexAPI.html", 
              ];
              
              for (const entryPoint of possibleEntryPoints) {
                if (fileListJson.includes(entryPoint)) {
                  scormObj.entryPoint = entryPoint;
                  break;
                }
              }
              
              // If still no entry point, look for any HTML file
              if (!scormObj.entryPoint) {
                const htmlFile = fileListJson.find(file => 
                  file.endsWith('.html') || file.endsWith('.htm')
                );
                if (htmlFile) scormObj.entryPoint = htmlFile;
              }
            }
            
            // Look for template.xml files
            const templateFiles = fileListJson.filter(file => 
              file.endsWith('template.xml') || file.includes('/template.xml')
            );
            
            if (templateFiles.length > 0) {
              console.log(`Found template.xml files: ${templateFiles.join(', ')}`);
              
              // Add a special mapping for template.xml
              scormObj.templateFile = templateFiles[0];
            }
            
            // Package is in cache and we have the manifest info - notify client
            notifyClients({
              type: "extraction_complete",
              key: urlKey,
              scormObj: scormObj,
              fileList: fileListJson,
              originalUrl: url
            });
            
            return;
          } catch (error) {
            console.warn("Error processing cached manifest:", error);
            // Continue with fresh extraction
          }
        }
      }
      
      // If we get here, we need to extract the package
      // Track timing for each stage
      const stageTimings = {
        start: Date.now(),
        download: 0,
        processing: 0,
        extraction: 0
      };
      
      // Notify client of extraction start
      notifyClients({ 
        type: "extraction_progress", 
        key: urlKey,
        status: "downloading",
        stage: "download",
        progress: 0,
        totalSize: 0,
        startTime: stageTimings.start
      });
      
      // Fetch the SCORM package using streaming to track download progress
      console.log(`[SW DEBUG] Starting download of SCORM package from ${url}`);
      
      // Reset progress tracking variables for this download
      lastReportedProgress = 0;
      lastReportedTime = 0;
      
      let blob;
      try {
        // Make the initial fetch request
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch SCORM package: ${response.status}`);
        }
        
        // Get content length if available
        const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
        if (contentLength === 0) {
          // If content length is not available, we can't track progress
          // Just download the whole thing directly
          blob = await response.blob();
        } else {
          // We have a content length, so we can track download progress
          // Setup progress tracking
          const reader = response.body.getReader();
          let receivedLength = 0;
          const chunks = [];
          
          // Read the stream
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              break;
            }
            
            // Push chunk to array
            chunks.push(value);
            receivedLength += value.length;
            
            // Calculate progress
            const progress = receivedLength / contentLength;
            const now = Date.now();
            const progressDiff = Math.abs(progress - lastReportedProgress);
            const timeDiff = now - lastReportedTime;
            
            // Only report progress if significant change or enough time passed
            if (progressDiff >= PROGRESS_THRESHOLD || timeDiff >= TIME_THRESHOLD) {
              // Report progress updates - scale within 0-80% range for download phase
            notifyClients({ 
              type: "extraction_progress", 
              key: urlKey,
              status: "downloading",
              stage: "download",
                progress: progress * 0.8, // Scale to 0-80% of overall process (updated from 0.2)
              totalSize: contentLength,
              downloaded: receivedLength,
              startTime: stageTimings.start,
                elapsedTime: now - stageTimings.start
            });
            
              // Only log significant changes to console
              if (progressDiff >= LOG_THRESHOLD || timeDiff >= LOG_TIME_THRESHOLD) {
            console.log(`[SW DEBUG] Download progress: ${Math.round(progress * 100)}%, ${receivedLength}/${contentLength} bytes`);
              }
              
              // Update last reported values
              lastReportedProgress = progress;
              lastReportedTime = now;
            }
          }
          
          // Concatenate chunks into a single Uint8Array
          const chunksAll = new Uint8Array(receivedLength);
          let position = 0;
          for (const chunk of chunks) {
            chunksAll.set(chunk, position);
            position += chunk.length;
          }
          
          // Convert to blob
          blob = new Blob([chunksAll]);
        }
      } catch (error) {
        console.error("Download error:", error);
        throw new Error(`Failed to download SCORM package: ${error.message}`);
      }
      
      // Record download completion time
      stageTimings.download = Date.now();
      const downloadDuration = stageTimings.download - stageTimings.start;
      console.log(`[SW DEBUG] Download completed in ${downloadDuration}ms, size: ${blob.size} bytes`);
      
      // Notify client of processing start
      notifyClients({ 
        type: "extraction_progress", 
        key: urlKey,
        status: "processing",
        stage: "processing",
        progress: 0.8, // Start processing at 80% (updated from 0.1)
        totalSize: blob.size,
        downloadTime: downloadDuration,
        startTime: stageTimings.start
      });
      
      const zip = new JSZip();
      
      // Load ZIP file - this is part of the processing stage
      console.log(`[SW DEBUG] Starting to process ZIP file structure`);
      await zip.loadAsync(blob);
      
      // Record processing completion time
      stageTimings.processing = Date.now();
      const processingDuration = stageTimings.processing - stageTimings.download;
      console.log(`[SW DEBUG] ZIP processing completed in ${processingDuration}ms`);
      
      // Notify client of extraction start
      notifyClients({ 
        type: "extraction_progress", 
        key: urlKey,
        status: "extracting",
        stage: "extraction",
        progress: 0.9, // Start extraction at 90% (updated from 0.2)
        totalSize: blob.size,
        downloadTime: downloadDuration,
        processingTime: processingDuration,
        startTime: stageTimings.start
      });
      
      // Get file list before extraction
      const fileList = Object.keys(zip.files).filter(
        (path) => !zip.files[path].dir
      );
      
      // Log information about the package
      const xmlFiles = fileList.filter(file => file.endsWith('.xml'));
      console.log(`[SW DEBUG] Package contains ${fileList.length} files, including ${xmlFiles.length} XML files`);
      
      // Store file list in cache
      await cache.put(
        new Request(`${PREFIX}/fileList.json`),
        new Response(JSON.stringify(fileList), {
          headers: { "Content-Type": "application/json" }
        })
      );
      
      // Find and process the manifest
      const xml = await zip.file("imsmanifest.xml")?.async("string");
      if (!xml) {
        throw new Error("imsmanifest.xml not found in SCORM ZIP.");
      }
      
      // Cache the manifest immediately
      await cache.put(
        new Request(`${PREFIX}/imsmanifest.xml`), 
        new Response(xml, { 
          headers: { "Content-Type": "application/xml" } 
        })
      );
      
      // Parse SCORM details from manifest
      const scormObj = parseManifest(xml);
      scormObj.PREFIX = PREFIX;
      
      // Find a default entry point if not determined from manifest
      if (!scormObj.entryPoint) {
        // Look for common entry point file patterns
        const possibleEntryPoints = [
          "scormRLO.htm",
          "story.html",
          "player.html",
          "launch.html",
          "scormdriver/indexAPI.html", 
          "index.htm"
        ];
        
        for (const entryPoint of possibleEntryPoints) {
          if (fileList.includes(entryPoint)) {
            scormObj.entryPoint = entryPoint;
            break;
          }
        }
        
        // If still no entry point, try to find an HTML file
        if (!scormObj.entryPoint) {
          const htmlFile = fileList.find(file => 
            file.endsWith('.html') || file.endsWith('.htm')
          );
          
          if (htmlFile) {
            scormObj.entryPoint = htmlFile;
          }
        }
      }
      
      // Look for template.xml files - check for this specific issue
      const templateFiles = fileList.filter(file => 
        file.endsWith('template.xml') || file.includes('/template.xml')
      );
      
      if (templateFiles.length > 0) {
        console.log(`Found template.xml files: ${templateFiles.join(', ')}`);
        // Add this info to help with client-side resolution
        scormObj.templateFile = templateFiles[0];
      }
      
      // Extract and cache ALL files - this is a key change
      const totalFiles = fileList.length;
      let processedFiles = 0;
      
      // Extract files in batches to avoid overwhelming the browser
      const BATCH_SIZE = 20;
      
      // Progress throttling - limit updates to avoid overwhelming the client
      // Send at most 1 update per this many milliseconds (unless it's the last update)
      const PROGRESS_THROTTLE_MS = 250;
      let lastProgressUpdate = Date.now();
      
      // Process files in batches
      for (let i = 0; i < fileList.length; i += BATCH_SIZE) {
        const batch = fileList.slice(i, i + BATCH_SIZE);
        
        // Process each file in the batch
        await Promise.all(batch.map(async (filePath) => {
          try {
            const fileContent = await zip.file(filePath)?.async("blob");
            if (fileContent) {
              const fileExt = filePath.split(".").pop().toLowerCase();
              const mime = Mimes[fileExt] || "application/octet-stream";
              
              // Cache the file
              await cache.put(
                new Request(`${PREFIX}/${filePath}`),
                new Response(fileContent, { 
                  headers: { "Content-Type": mime }
                })
              );
              
              // For files that might be accessed from different paths (like template.xml),
              // create an additional cache entry for root-level access
              if (filePath.includes('/') && templateFiles.includes(filePath)) {
                const fileName = filePath.split('/').pop();
                console.log(`Creating additional cache entry for ${fileName} from ${filePath}`);
                await cache.put(
                  new Request(`${PREFIX}/${fileName}`),
                  new Response(fileContent, { 
                    headers: { "Content-Type": mime }
                  })
                );
              }
            }
          } catch (err) {
            console.warn(`Error caching file ${filePath}:`, err);
            // Continue with other files even if one fails
          }
          
          // Update progress after each file
          processedFiles++;
          
          // Calculate progress - scale between 90% and 100%
          // This leaves room for download (0-80%) and processing (80-90%)
          const extractionProgress = processedFiles / totalFiles;
          const overallProgress = 0.9 + (extractionProgress * 0.1); // Updated from 0.2 + (extractionProgress * 0.75)
          
          const now = Date.now();
          // Only send updates if enough time has passed or it's the last file
          if (processedFiles === totalFiles || (now - lastProgressUpdate) >= PROGRESS_THROTTLE_MS) {
            const elapsedTime = now - stageTimings.start;
            lastProgressUpdate = now;
            
            console.log(`[SW DEBUG] Extraction progress: ${Math.round(extractionProgress * 100)}%, processed ${processedFiles}/${totalFiles} files in ${elapsedTime}ms`);
            
            notifyClients({ 
              type: "extraction_progress", 
              key: urlKey,
              status: "extracting",
              stage: "extraction",
              progress: overallProgress,
              fileCount: totalFiles,
              processedFiles,
              elapsedTime,
              totalSize: blob.size,
              startTime: stageTimings.start
            });
          }
        }));
      }
      
      // Record extraction completion time
      stageTimings.extraction = Date.now();
      const extractionDuration = stageTimings.extraction - stageTimings.processing;
      const totalDuration = stageTimings.extraction - stageTimings.start;
      
      console.log(`[SW DEBUG] Extraction completed in ${extractionDuration}ms, total time: ${totalDuration}ms`);
      
      // Send final progress update (100%)
      notifyClients({ 
        type: "extraction_progress", 
        key: urlKey,
        status: "complete",
        stage: "complete",
        progress: 1.0,
        fileCount: totalFiles,
        processedFiles: totalFiles,
        elapsedTime: totalDuration,
        totalSize: blob.size,
        startTime: stageTimings.start,
        timings: {
          download: downloadDuration,
          processing: processingDuration,
          extraction: extractionDuration,
          total: totalDuration
        }
      });
      
      // Notify clients that extraction is complete
      notifyClients({
        type: "extraction_complete",
        scormObj,
        key: urlKey,
        fileList,
        originalUrl: url,
        timings: {
          download: downloadDuration,
          processing: processingDuration,
          extraction: extractionDuration,
          total: totalDuration
        }
      });
    } catch (error) {
      console.error("SCORM extraction error:", error);
      
      // Notify clients of extraction failure
      notifyClients({ 
        type: "extraction_error", 
        key: urlKey,
        error: error.message
      });
    }
  }
  
  // If this is a cache invalidation request
  else if (type === "invalidate" && key) {
    try {
      // Delete from resolvers
      if (resolvers[key]) {
        delete resolvers[key];
      }
      
      // Delete from cache
      const cache = await caches.open(CACHE_NAME);
      const keys = await cache.keys();
      const toDelete = keys.filter(request => 
        request.url.includes(`${FOLDER_PREFIX}/${key}/`)
      );
      
      await Promise.all(toDelete.map(request => cache.delete(request)));
      
      // Notify clients
      notifyClients({
        type: "invalidation_complete",
        key
      });
    } catch (error) {
      console.error("Cache invalidation error:", error);
      
      notifyClients({
        type: "invalidation_error",
        key,
        error: error.message
      });
    }
  }
});

/**
 * Fetch event handler - intercepts requests for SCORM content
 */
self.addEventListener("fetch", async (e) => {
  const url = new URL(e.request.url);
  
  // Only handle requests with our FOLDER_PREFIX
  if (url.pathname.includes(FOLDER_PREFIX)) {
    e.respondWith(
      (async () => {
        try {
          // Extract the package key from the URL
          const pathParts = url.pathname.split(FOLDER_PREFIX);
          if (pathParts.length < 2) {
            return new Response("Invalid SCORM URL format", { 
              status: 400, 
              headers: { "Content-Type": "text/plain" }
            });
          }
          
          // Check if this is a request for a file within the package
          const cache = await caches.open(CACHE_NAME);
          
          // Try exact match first
          const cachedResponse = await cache.match(e.request);
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Get the key and file path
          const key = pathParts[1].split("/")[1];
          const requestPath = pathParts[2].substr(1).split("?")[0];
          const prefix = `${FOLDER_PREFIX}/${key}/${FOLDER_PREFIX}/`;
          
          // Check for query parameters, they might indicate a relative path request
          // from a different base path
          const queryParams = new URLSearchParams(url.search);
          
          // Check if the file list exists to verify the package exists
          const fileListUrl = `${prefix}fileList.json`;
          const fileListResponse = await cache.match(new Request(fileListUrl));
          
          if (fileListResponse) {
            // Package exists, try to get the file list
            const fileList = await fileListResponse.json();
            
            // Log debugging information
            console.log(`SCORM fetch request for ${requestPath} in package ${key}`);
            
            // Try to find the file with different casing (case-insensitive search)
            const lowerCasePath = requestPath.toLowerCase();
            const matchedFile = fileList.find(file => file.toLowerCase() === lowerCasePath);
            
            if (matchedFile) {
              console.log(`Found case-insensitive match: ${matchedFile} for ${requestPath}`);
              const caseInsensitiveResponse = await cache.match(new Request(`${prefix}${matchedFile}`));
              
              if (caseInsensitiveResponse) {
                return caseInsensitiveResponse;
              }
            }
            
            // Try with common parent directories as final fallback
            const commonDirectories = [
              "common/",
              "shared/",
              "assets/",
              "js/",
              "scripts/",
              "css/",
              "styles/",
              "data/",
              "media/"
            ];
            
            for (const dir of commonDirectories) {
              const pathWithDir = dir + requestPath;
              if (fileList.includes(pathWithDir)) {
                console.log(`Found file at alternate path: ${pathWithDir}`);
                const altPathResponse = await cache.match(new Request(`${prefix}${pathWithDir}`));
                
                if (altPathResponse) {
                  return altPathResponse;
                }
              }
            }
            
            // File truly not found in package
            return new Response(`File not found in SCORM package: ${requestPath}`, {
              status: 404,
              headers: { "Content-Type": "text/plain" }
            });
          } else {
            // Package itself doesn't exist
            return new Response("SCORM package not found", {
              status: 404,
              headers: { "Content-Type": "text/plain" }
            });
          }
        } catch (error) {
          console.error("Error in fetch handler:", error);
          return new Response(`Error: ${error.message}`, {
            status: 500,
            headers: { "Content-Type": "text/plain" }
          });
        }
      })()
    );
  }
});

/**
 * Utility functions
 */

/**
 * Notifies all connected clients with a message
 * @param {Object} message - Message to send to clients
 */
async function notifyClients(message) {
  const clients = await self.clients.matchAll();
  
  // Enhanced logging for progress messages
  if (message.type === 'extraction_progress') {
    // Log progress messages only for non-download stages or when it's a significant state change
    // Download stage progress is already logged in the download loop with throttling
    if (message.stage !== 'download' || message.status === 'completed') {
    const progressPercent = Math.round((message.progress || 0) * 100);
    const stage = message.stage || message.status || 'unknown';
    const fileInfo = message.fileCount ? 
      `${message.processedFiles || 0}/${message.fileCount} files` : '';
    const timeInfo = message.elapsedTime ? 
      `${Math.round(message.elapsedTime / 1000)}s elapsed` : '';
      
    console.log(`[SW DEBUG] Progress update: ${progressPercent}%, stage: ${stage}, ${fileInfo} ${timeInfo}`);
    }
  }
  
  for (const client of clients) {
    client.postMessage(message);
  }
}

/**
 * Creates a safe key from a URL for storage
 * @param {string} url - URL to convert to key
 * @returns {string} URL-safe key
 */
function createKeyFromUrl(url) {
  // Create a deterministic but safe key from the URL
  return url
    .replace(/([^\w ]|_)/g, "")
    .slice(0, 50);
} 