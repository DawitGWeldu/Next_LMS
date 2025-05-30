"use client";

import { openDB, IDBPDatabase, StoreNames, DBSchema } from 'idb';
import { ExtractedScormPackage } from './scorm-extractor';
import { 
  isServiceWorkerSupported, 
  hasActiveServiceWorkerController,
  extractAndWaitForCompletion, 
  invalidateScormPackage as invalidateServiceWorkerPackage,
  getScormFileUrl
} from './service-worker-registry';

/**
 * Database name for the SCORM cache
 */
const DB_NAME = 'scorm-cache';

/**
 * Current database version - increment when schema changes
 */
const DB_VERSION = 1;

/**
 * Cache entry time-to-live in milliseconds (default: 7 days)
 */
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

/**
 * Maximum number of cached packages (for LRU eviction)
 */
const MAX_CACHED_PACKAGES = 10;

/**
 * Cache strategy for SCORM packages
 */
export enum CacheStrategy {
  /**
   * Use only IndexedDB for caching (fallback mode)
   */
  INDEXEDDB_ONLY = 'indexeddb_only',
  
  /**
   * Use only service worker cache (best performance)
   */
  SERVICE_WORKER_ONLY = 'service_worker_only',
  
  /**
   * Use both caching mechanisms (default - best reliability)
   */
  HYBRID = 'hybrid'
}

/**
 * Store names in the IndexedDB database
 */
const STORE = {
  PACKAGES: 'packages',
  METADATA: 'metadata'
} as const;

/**
 * Interface for ScormPackageMetadata stored in IndexedDB
 */
interface ScormPackageMetadata {
  /**
   * Unique key for the package (typically the URL or other identifier)
   */
  key: string;
  
  /**
   * When the package was added to the cache
   */
  timestamp: number;
  
  /**
   * When the package was last accessed
   */
  lastAccessed: number;
  
  /**
   * Size of the package in bytes (approximate)
   */
  size: number;
  
  /**
   * Version of the SCORM package
   */
  version: string;
  
  /**
   * Original URL of the SCORM package
   */
  originalUrl: string;

  /**
   * Caching strategy used for this package
   */
  cacheStrategy: CacheStrategy;

  /**
   * Whether the package is available in the service worker cache
   */
  inServiceWorkerCache: boolean;
}

/**
 * Interface for CachedScormPackage stored in IndexedDB
 */
interface CachedScormPackage {
  /**
   * Unique key for the package
   */
  key: string;
  
  /**
   * Serialized manifest data
   */
  manifest: string;
  
  /**
   * Array of file entries
   */
  files: Array<{
    path: string;
    blob: Blob;
  }>;
}

/**
 * Schema definition for the SCORM cache database
 */
interface ScormCacheDB extends DBSchema {
  [STORE.PACKAGES]: {
    key: string;
    value: CachedScormPackage;
  };
  [STORE.METADATA]: {
    key: string;
    value: ScormPackageMetadata;
    indexes: {
      'by-timestamp': number;
      'by-lastAccessed': number;
    };
  };
}

/**
 * Cache initialization status
 */
let dbPromise: Promise<IDBPDatabase<ScormCacheDB>> | null = null;

/**
 * Initialize the cache database
 * @returns Promise resolving to the database instance
 */
export async function initCache(): Promise<IDBPDatabase<ScormCacheDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ScormCacheDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create stores if they don't exist
        if (!db.objectStoreNames.contains(STORE.PACKAGES)) {
          db.createObjectStore(STORE.PACKAGES, { keyPath: 'key' });
        }
        
        if (!db.objectStoreNames.contains(STORE.METADATA)) {
          const metadataStore = db.createObjectStore(STORE.METADATA, { keyPath: 'key' });
          metadataStore.createIndex('by-timestamp', 'timestamp');
          metadataStore.createIndex('by-lastAccessed', 'lastAccessed');
        }
      },
      blocking() {
        console.warn('Another version of the app is trying to use the SCORM cache. Closing database.');
        dbPromise?.then(db => db.close());
        dbPromise = null;
      }
    });
  }
  
  return dbPromise;
}

/**
 * Determine the optimal cache strategy based on browser capabilities
 * @returns The optimal cache strategy
 */
export function determineOptimalCacheStrategy(): CacheStrategy {
  // Check if service workers are supported and active
  if (isServiceWorkerSupported() && hasActiveServiceWorkerController()) {
    return CacheStrategy.HYBRID; // Use both for best reliability
  }
  
  return CacheStrategy.INDEXEDDB_ONLY; // Fallback to IndexedDB only
}

/**
 * Check if a package exists in the service worker cache
 * @param key The key of the package to check
 * @returns Promise resolving to true if the package exists in the service worker cache
 */
export async function isInServiceWorkerCache(key: string): Promise<boolean> {
  if (!isServiceWorkerSupported() || !hasActiveServiceWorkerController()) {
    return false;
  }
  
  // Try to fetch the manifest.json file from the service worker cache
  // If this file exists, we assume the package is in the cache
  try {
    const manifestUrl = getScormFileUrl(key, 'imsmanifest.xml');
    const response = await fetch(manifestUrl, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    console.error(`Error checking if ${key} is in service worker cache:`, error);
    return false;
  }
}

/**
 * Calculate the approximate size of a package in bytes
 * @param extractedPackage The extracted SCORM package
 * @returns Approximate size in bytes
 */
function calculatePackageSize(extractedPackage: ExtractedScormPackage): number {
  let size = 0;
  
  // Add manifest size (rough estimation based on stringified JSON)
  size += JSON.stringify(extractedPackage.manifest).length * 2;
  
  // Add size of all files
  extractedPackage.files.forEach((blob) => {
    size += blob.size;
  });
  
  return size;
}

/**
 * Evict least recently used packages to stay within storage limits
 * @param db Database instance
 */
async function evictLRUPackagesIfNeeded(db: IDBPDatabase<ScormCacheDB>): Promise<void> {
  try {
    // Get all metadata sorted by last accessed time
    const tx = db.transaction(STORE.METADATA, 'readonly');
    const metadataStore = tx.objectStore(STORE.METADATA);
    const metadataIndex = metadataStore.index('by-lastAccessed');
    const allMetadata = await metadataIndex.getAll();
    await tx.done;
    
    // If we have more than the maximum allowed packages, remove the oldest ones
    if (allMetadata.length > MAX_CACHED_PACKAGES) {
      // Sort by last accessed time (ascending)
      allMetadata.sort((a, b) => a.lastAccessed - b.lastAccessed);
      
      // Remove the oldest packages
      const packagesToRemove = allMetadata.slice(0, allMetadata.length - MAX_CACHED_PACKAGES);
      
      for (const metadata of packagesToRemove) {
        await invalidateCache(metadata.key);
      }
    }
  } catch (error) {
    console.error('Error evicting LRU packages:', error);
  }
}

/**
 * Check remaining storage quota
 * @returns Promise resolving to estimated quota info or null if not supported
 */
export async function checkStorageQuota(): Promise<{ usage: number, quota: number } | null> {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimation = await navigator.storage.estimate();
      return {
        usage: estimation.usage || 0,
        quota: estimation.quota || 0
      };
    } catch (error) {
      console.error('Error checking storage quota:', error);
    }
  }
  
  return null;
}

/**
 * Store a SCORM package in the cache using the specified strategy
 * @param key Unique key for the package
 * @param extractedPackage The extracted SCORM package
 * @param strategy Cache strategy to use (defaults to optimal strategy)
 * @returns Promise resolving when the package is stored
 */
export async function storeScormPackage(
  key: string, 
  extractedPackage: ExtractedScormPackage,
  strategy?: CacheStrategy
): Promise<void> {
  // Use the provided strategy or determine the optimal one
  const cacheStrategy = strategy || determineOptimalCacheStrategy();
  
  // Calculate package size
  const packageSize = calculatePackageSize(extractedPackage);
  
  try {
    // Initialize the cache
    const db = await initCache();
    
    // Check if we need to evict packages first
    await evictLRUPackagesIfNeeded(db);
    
    // Check storage quota
    const quotaInfo = await checkStorageQuota();
    if (quotaInfo) {
      // If we're using more than 90% of quota already, or this package would exceed quota
      if (quotaInfo.usage > quotaInfo.quota * 0.9 || quotaInfo.usage + packageSize > quotaInfo.quota) {
        console.warn('Storage quota is nearly full. Evicting all packages.');
        await clearCache();
      }
    }
    
    // Flag to track if the package was stored in the service worker cache
    let inServiceWorkerCache = false;
    
    // If using service worker or hybrid strategy, store in service worker cache
    if ((cacheStrategy === CacheStrategy.SERVICE_WORKER_ONLY || 
         cacheStrategy === CacheStrategy.HYBRID) && 
         isServiceWorkerSupported() && 
         hasActiveServiceWorkerController()) {
      
      try {
        // Service worker extracts package from the original URL
        const result = await extractAndWaitForCompletion(
          extractedPackage.originalUrl,
          key
        );
        
        inServiceWorkerCache = result.success;
        
        if (!result.success) {
          console.warn(`Failed to store package in service worker cache: ${result.error}`);
          
          // If we're using SERVICE_WORKER_ONLY strategy and it failed, we need to fall back
          if (cacheStrategy === CacheStrategy.SERVICE_WORKER_ONLY) {
            console.warn('Falling back to IndexedDB cache');
            // Use a new variable instead of trying to reassign to the constant
            const fallbackStrategy = CacheStrategy.INDEXEDDB_ONLY;
            
            // Store the package in IndexedDB
            await storeInIndexedDB(db, key, extractedPackage, packageSize, fallbackStrategy, inServiceWorkerCache);
            return; // Exit after handling the fallback
          }
        } else {
          console.log(`Package ${key} successfully stored in service worker cache`);
        }
      } catch (error) {
        console.error('Error storing package in service worker cache:', error);
        
        // If we're using SERVICE_WORKER_ONLY strategy and it failed, we need to fall back
        if (cacheStrategy === CacheStrategy.SERVICE_WORKER_ONLY) {
          console.warn('Falling back to IndexedDB cache');
          // Use a new variable instead of trying to reassign to the constant
          const fallbackStrategy = CacheStrategy.INDEXEDDB_ONLY;
          
          // Store the package in IndexedDB
          await storeInIndexedDB(db, key, extractedPackage, packageSize, fallbackStrategy, inServiceWorkerCache);
          return; // Exit after handling the fallback
        }
      }
    }
    
    // If using IndexedDB or hybrid strategy, or if service worker cache failed,
    // store in IndexedDB
    if (cacheStrategy === CacheStrategy.INDEXEDDB_ONLY || 
        cacheStrategy === CacheStrategy.HYBRID || 
        (cacheStrategy === CacheStrategy.SERVICE_WORKER_ONLY && !inServiceWorkerCache)) {
      
      await storeInIndexedDB(db, key, extractedPackage, packageSize, cacheStrategy, inServiceWorkerCache);
    }
  } catch (error) {
    console.error('Error storing SCORM package in cache:', error);
    
    // If storage quota is exceeded, clear the cache and try again
    if (error instanceof DOMException && 
        (error.name === 'QuotaExceededError' || error.code === 22)) {
      console.warn('Storage quota exceeded. Clearing cache and retrying.');
      await clearCache();
      
      // Try storing again with a fresh cache, but only in IndexedDB
      // to minimize the risk of running out of space again
      try {
        const db = await initCache();
        await storeInIndexedDB(
          db, 
          key, 
          extractedPackage, 
          packageSize, 
          CacheStrategy.INDEXEDDB_ONLY, 
          false
        );
      } catch (retryError) {
        console.error('Error retrying storage after cache clear:', retryError);
        throw new Error('Failed to store SCORM package in cache');
      }
    } else {
      throw new Error(`Failed to store SCORM package in cache: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Helper function to store a package in IndexedDB
 * @param db The database instance
 * @param key The package key
 * @param extractedPackage The extracted package
 * @param packageSize The calculated package size
 * @param cacheStrategy The cache strategy to use
 * @param inServiceWorkerCache Whether the package is in the service worker cache
 */
async function storeInIndexedDB(
  db: IDBPDatabase<ScormCacheDB>,
  key: string,
  extractedPackage: ExtractedScormPackage,
  packageSize: number,
  cacheStrategy: CacheStrategy,
  inServiceWorkerCache: boolean
): Promise<void> {
  // Create a serializable version of the package
  const cachedPackage: CachedScormPackage = {
    key,
    manifest: JSON.stringify(extractedPackage.manifest),
    files: []
  };
  
  // Add all files to the cache
  extractedPackage.files.forEach((blob, path) => {
    cachedPackage.files.push({ path, blob });
  });
  
  // Create metadata for the package
  const metadata: ScormPackageMetadata = {
    key,
    timestamp: Date.now(),
    lastAccessed: Date.now(),
    size: packageSize,
    version: extractedPackage.version,
    originalUrl: extractedPackage.originalUrl,
    cacheStrategy,
    inServiceWorkerCache
  };
  
  // Store both the package and metadata
  const tx = db.transaction([STORE.PACKAGES, STORE.METADATA], 'readwrite');
  await tx.objectStore(STORE.PACKAGES).put(cachedPackage);
  await tx.objectStore(STORE.METADATA).put(metadata);
  await tx.done;
}

/**
 * Retrieve a SCORM package from the cache, prioritizing the service worker cache if available
 * @param key Unique key for the package
 * @returns Promise resolving to the extracted package or null if not found
 */
export async function getScormPackage(key: string): Promise<ExtractedScormPackage | null> {
  try {
    // Initialize the cache
    const db = await initCache();
    
    // Get the metadata to determine the cache strategy
    const metadata = await db.get(STORE.METADATA, key);
    if (!metadata) {
      // If no metadata, the package is not in our cache
      return null;
    }
    
    // Update last accessed time
    metadata.lastAccessed = Date.now();
    await db.put(STORE.METADATA, metadata);
    
    // Check if the package has expired
    if ((Date.now() - metadata.timestamp) > CACHE_TTL) {
      console.log(`SCORM package ${key} has expired. Removing from cache.`);
      await invalidateCache(key);
      return null;
    }
    
    // If the package is in the service worker cache and service workers are supported
    if (metadata.inServiceWorkerCache && 
        isServiceWorkerSupported() && 
        hasActiveServiceWorkerController()) {
        
      // Verify that it's actually still in the service worker cache
      const stillInServiceWorkerCache = await isInServiceWorkerCache(key);
      
      if (stillInServiceWorkerCache) {
        // We don't need to load the full package here, since it will be
        // served directly from the service worker when requested
        return {
          manifest: JSON.parse(metadata.originalUrl ? JSON.stringify({
            version: metadata.version,
            originalUrl: metadata.originalUrl
          }) : '{}'),
          files: new Map(), // Empty map since files are served by service worker
          originalUrl: metadata.originalUrl,
          extractedAt: metadata.timestamp,
          version: metadata.version as any || 'unknown'
        };
      } else {
        // Update metadata to reflect that it's no longer in service worker cache
        metadata.inServiceWorkerCache = false;
        await db.put(STORE.METADATA, metadata);
      }
    }
    
    // If we get here, either the package is not in service worker cache
    // or service workers are not supported, so we need to get it from IndexedDB
    
    // Check if the package exists in the cache
    const cachedPackage = await db.get(STORE.PACKAGES, key);
    if (!cachedPackage) {
      return null;
    }
    
    // Reconstruct the ExtractedScormPackage
    const files = new Map<string, Blob>();
    cachedPackage.files.forEach(file => {
      files.set(file.path, file.blob);
    });
    
    // Return the reconstructed package
    return {
      manifest: JSON.parse(cachedPackage.manifest),
      files,
      originalUrl: metadata.originalUrl,
      extractedAt: metadata.timestamp,
      version: metadata.version as any || 'unknown'
    };
  } catch (error) {
    console.error('Error retrieving SCORM package from cache:', error);
    return null;
  }
}

/**
 * Remove a package from all caches
 * @param key Unique key for the package
 * @returns Promise resolving when the package is removed
 */
export async function invalidateCache(key: string): Promise<void> {
  try {
    // Initialize the cache
    const db = await initCache();
    
    // Get metadata to check if the package is in the service worker cache
    const metadata = await db.get(STORE.METADATA, key);
    
    // If the package is in the service worker cache and service workers are supported
    if (metadata?.inServiceWorkerCache && 
        isServiceWorkerSupported() && 
        hasActiveServiceWorkerController()) {
      // Invalidate from service worker cache
      try {
        await invalidateServiceWorkerPackage(key);
      } catch (error) {
        console.error(`Error removing package ${key} from service worker cache:`, error);
      }
    }
    
    // Remove from IndexedDB
    const tx = db.transaction([STORE.PACKAGES, STORE.METADATA], 'readwrite');
    await tx.objectStore(STORE.PACKAGES).delete(key);
    await tx.objectStore(STORE.METADATA).delete(key);
    await tx.done;
    
    console.log(`Package ${key} removed from all caches`);
  } catch (error) {
    console.error('Error removing package from cache:', error);
  }
}

/**
 * Clear all cached SCORM packages from all caching mechanisms
 * @returns Promise resolving when the cache is cleared
 */
export async function clearCache(): Promise<void> {
  try {
    // Initialize the cache
    const db = await initCache();
    
    // Get all metadata to find packages in service worker cache
    const allMetadata = await db.getAll(STORE.METADATA);
    
    // Clear service worker cache for all packages that are in it
    if (isServiceWorkerSupported() && hasActiveServiceWorkerController()) {
      for (const metadata of allMetadata) {
        if (metadata.inServiceWorkerCache) {
          try {
            await invalidateServiceWorkerPackage(metadata.key);
          } catch (error) {
            console.error(`Error clearing package ${metadata.key} from service worker cache:`, error);
          }
        }
      }
    }
    
    // Clear IndexedDB cache
    const tx = db.transaction([STORE.PACKAGES, STORE.METADATA], 'readwrite');
    await tx.objectStore(STORE.PACKAGES).clear();
    await tx.objectStore(STORE.METADATA).clear();
    await tx.done;
    
    console.log('All SCORM caches cleared successfully');
  } catch (error) {
    console.error('Error clearing SCORM cache:', error);
  }
}

/**
 * Get metadata for all cached packages
 * @returns Promise resolving to an array of metadata entries
 */
export async function getAllCacheMetadata(): Promise<ScormPackageMetadata[]> {
  try {
    // Initialize the cache
    const db = await initCache();
    
    // Get all metadata
    return await db.getAll(STORE.METADATA);
  } catch (error) {
    console.error('Error getting cache metadata:', error);
    return [];
  }
}

/**
 * Get the total size of all cached packages
 * @returns Promise resolving to the total size in bytes
 */
export async function getCacheTotalSize(): Promise<number> {
  try {
    const metadata = await getAllCacheMetadata();
    return metadata.reduce((total, item) => total + item.size, 0);
  } catch (error) {
    console.error('Error calculating cache size:', error);
    return 0;
  }
}

/**
 * Sync metadata with service worker cache, updating inServiceWorkerCache flags
 * @returns Promise resolving when synchronization is complete
 */
export async function syncCacheMetadata(): Promise<void> {
  if (!isServiceWorkerSupported() || !hasActiveServiceWorkerController()) {
    return;
  }
  
  try {
    const db = await initCache();
    const metadata = await db.getAll(STORE.METADATA);
    
    for (const item of metadata) {
      const inCache = await isInServiceWorkerCache(item.key);
      
      if (item.inServiceWorkerCache !== inCache) {
        item.inServiceWorkerCache = inCache;
        await db.put(STORE.METADATA, item);
      }
    }
    
    console.log('Cache metadata synchronized with service worker cache');
  } catch (error) {
    console.error('Error synchronizing cache metadata:', error);
  }
} 