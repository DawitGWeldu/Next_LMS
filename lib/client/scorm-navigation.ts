"use client";

import { ScormManifest, ScormItem, ScormResource } from '@/lib/scorm';
import { ExtractedScormPackage, createFileObjectURL } from './scorm-extractor';

/**
 * Represents a navigation item in the SCORM content structure
 */
export interface NavigationItem {
  /**
   * Unique identifier for the item
   */
  id: string;
  
  /**
   * Display title of the item
   */
  title: string;
  
  /**
   * Path to the content file
   */
  path?: string;
  
  /**
   * Object URL for the content, if generated
   */
  url?: string;
  
  /**
   * Whether this item has content
   */
  hasContent: boolean;
  
  /**
   * Level in the navigation hierarchy (0 is top level)
   */
  level: number;
  
  /**
   * Child navigation items
   */
  children: NavigationItem[];
}

/**
 * Navigation options for building the tree
 */
export interface NavigationOptions {
  /**
   * Whether to generate object URLs for content items
   */
  generateUrls?: boolean;
  
  /**
   * Maximum depth of the navigation tree (-1 for unlimited)
   */
  maxDepth?: number;
}

/**
 * Result of a navigation action
 */
export interface NavigationResult {
  /**
   * The item that was found
   */
  item: NavigationItem;
  
  /**
   * The URL to navigate to
   */
  url: string | null;
  
  /**
   * The relative path to the content file
   */
  path: string;
  
  /**
   * The resource associated with this item
   */
  resource: ScormResource;
  
  /**
   * Breadcrumb path to the item (array of ancestor items)
   */
  breadcrumb: NavigationItem[];
}

/**
 * Finds an item by ID in an array of items
 */
function findItemInItems(items: ScormItem[], itemId: string): ScormItem | undefined {
  for (const item of items) {
    if (item.identifier === itemId) {
      return item;
    }
    
    // Recursively search in children
    if (item.children && item.children.length > 0) {
      const found = findItemInItems(item.children, itemId);
      if (found) {
        return found;
      }
    }
  }
  
  return undefined;
}

/**
 * Finds an item by ID in the manifest
 */
function findManifestItem(manifest: ScormManifest, itemId: string): ScormItem | undefined {
  // Search for the item in all organizations
  for (const orgId in manifest.organizations) {
    const org = manifest.organizations[orgId];
    const found = findItemInItems(org.items, itemId);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/**
 * Builds a navigation tree from a SCORM manifest
 * 
 * @param extractedPackage The extracted SCORM package
 * @param options Navigation options
 * @returns Array of NavigationItem objects representing the content structure
 */
export function buildNavigationTree(
  extractedPackage: ExtractedScormPackage,
  options: NavigationOptions = {}
): NavigationItem[] {
  const { manifest } = extractedPackage;
  const { maxDepth = -1 } = options;
  
  // Initialize the result array
  const result: NavigationItem[] = [];
  
  // Process each organization in the manifest
  for (const orgId in manifest.organizations) {
    const organization = manifest.organizations[orgId];
    
    // Process items recursively
    const processItems = (
      items: ScormItem[],
      level: number = 0,
      parentNavItem?: NavigationItem
    ): NavigationItem[] => {
      // Check if we've reached the maximum depth
      if (maxDepth !== -1 && level > maxDepth) {
        return [];
      }
      
      return items.map(item => {
        // Create the navigation item
        const navItem: NavigationItem = {
          id: item.identifier,
          title: item.title,
          hasContent: !!item.resourceIdentifier,
          level,
          children: []
        };
        
        // If the item has a resource, get the content path
        if (item.resourceIdentifier) {
          const resource = manifest.resources[item.resourceIdentifier];
          if (resource && resource.href) {
            navItem.path = resource.href;
          }
        }
        
        // Process children if any
        if (item.children && item.children.length > 0) {
          navItem.children = processItems(item.children, level + 1, navItem);
        }
        
        return navItem;
      });
    };
    
    // Start processing from the top-level items
    const navItems = processItems(organization.items);
    
    // Add organization as a top-level item
    result.push({
      id: orgId,
      title: organization.title,
      hasContent: false,
      level: 0,
      children: navItems
    });
  }
  
  return result;
}

/**
 * Finds a navigation item by its ID in the navigation tree
 * 
 * @param tree Navigation tree to search
 * @param itemId ID of the item to find
 * @returns The found navigation item or undefined
 */
export function findNavigationItemById(
  tree: NavigationItem[],
  itemId: string
): NavigationItem | undefined {
  for (const item of tree) {
    if (item.id === itemId) {
      return item;
    }
    
    // Search in children
    if (item.children && item.children.length > 0) {
      const found = findNavigationItemById(item.children, itemId);
      if (found) {
        return found;
      }
    }
  }
  
  return undefined;
}

/**
 * Creates a breadcrumb path to a navigation item
 * 
 * @param tree Navigation tree to search
 * @param itemId ID of the target item
 * @returns Array of items forming the path to the target item
 */
export function buildNavigationPath(
  tree: NavigationItem[],
  itemId: string
): NavigationItem[] {
  const path: NavigationItem[] = [];
  
  const findPath = (items: NavigationItem[], targetId: string): boolean => {
    for (const item of items) {
      if (item.id === targetId) {
        path.push(item);
        return true;
      }
      
      if (item.children && item.children.length > 0) {
        if (findPath(item.children, targetId)) {
          path.unshift(item);
          return true;
        }
      }
    }
    
    return false;
  };
  
  findPath(tree, itemId);
  return path;
}

/**
 * Finds the first content item in the navigation tree
 * 
 * @param tree Navigation tree to search
 * @returns The first content item or undefined if no content items found
 */
export function findFirstContentItem(
  tree: NavigationItem[]
): NavigationItem | undefined {
  for (const item of tree) {
    if (item.hasContent && item.path) {
      return item;
    }
    
    // Search in children
    if (item.children && item.children.length > 0) {
      const found = findFirstContentItem(item.children);
      if (found) {
        return found;
      }
    }
  }
  
  return undefined;
}

/**
 * Navigates to a specific item by ID
 * 
 * @param extractedPackage The extracted SCORM package
 * @param itemId ID of the item to navigate to
 * @returns Promise resolving to a NavigationResult object, or null if navigation failed
 */
export async function navigateToItem(
  extractedPackage: ExtractedScormPackage,
  itemId: string
): Promise<NavigationResult | null> {
  const { manifest } = extractedPackage;
  
  // Find the item in the manifest
  const item = findManifestItem(manifest, itemId);
  
  if (!item) {
    console.error(`Item with ID ${itemId} not found in manifest`);
    return null;
  }
  
  // Check if the item has a resource
  if (!item.resourceIdentifier) {
    console.error(`Item with ID ${itemId} has no associated resource`);
    return null;
  }
  
  // Get the resource
  const resource = manifest.resources[item.resourceIdentifier];
  
  if (!resource) {
    console.error(`Resource ${item.resourceIdentifier} not found in manifest`);
    return null;
  }
  
  // Check if the resource has a file
  if (!resource.href) {
    console.error(`Resource ${item.resourceIdentifier} has no associated file`);
    return null;
  }
  
  // Create a URL for the content
  const url = await createFileObjectURL(extractedPackage, resource.href);
  
  // Build a navigation tree to create breadcrumb
  const navTree = buildNavigationTree(extractedPackage);
  const navItem = findNavigationItemById(navTree, itemId);
  
  if (!navItem) {
    console.error(`Navigation item with ID ${itemId} not found`);
    return null;
  }
  
  // Create the breadcrumb
  const breadcrumb = buildNavigationPath(navTree, itemId);
  
  // Return the navigation result
  return {
    item: navItem,
    url: url,
    path: resource.href,
    resource,
    breadcrumb
  };
}

/**
 * Finds the entry point for a SCORM package
 * 
 * @param extractedPackage The extracted SCORM package
 * @returns Promise resolving to a NavigationResult for the entry point, or null if not found
 */
export async function findEntryPoint(
  extractedPackage: ExtractedScormPackage
): Promise<NavigationResult | null> {
  const { manifest } = extractedPackage;
  
  // Check if we have an entry point in the manifest
  if (manifest.entryPoint) {
    // Find the item that corresponds to this entry point
    for (const orgId in manifest.organizations) {
      const org = manifest.organizations[orgId];
      
      // Find all items
      const allItems: ScormItem[] = [];
      const collectItems = (items: ScormItem[]) => {
        for (const item of items) {
          allItems.push(item);
          if (item.children && item.children.length > 0) {
            collectItems(item.children);
          }
        }
      };
      
      collectItems(org.items);
      
      // Find the item with the resource that matches the entry point
      for (const item of allItems) {
        if (item.resourceIdentifier) {
          const resource = manifest.resources[item.resourceIdentifier];
          if (resource && resource.href === manifest.entryPoint) {
            // Navigate to this item
            return navigateToItem(extractedPackage, item.identifier);
          }
        }
      }
    }
    
    // If we couldn't find an item with the entry point resource,
    // try using the entry point directly as a path
    const navTree = buildNavigationTree(extractedPackage);
    for (const org of navTree) {
      for (const item of org.children) {
        if (item.path === manifest.entryPoint) {
          return navigateToItem(extractedPackage, item.id);
        }
      }
    }
  }
  
  // If no specific entry point found, find the first item with content
  const navTree = buildNavigationTree(extractedPackage);
  const firstContentItem = findFirstContentItem(navTree);
  
  if (firstContentItem && firstContentItem.id) {
    return navigateToItem(extractedPackage, firstContentItem.id);
  }
  
  return null;
} 