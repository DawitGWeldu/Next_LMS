import JSZip from 'jszip';
import xml2js from 'xml2js';

// Import Node.js modules only on the server side
const isServer = typeof window === 'undefined';

// Server-side only imports and setup
let fs: any;
let path: any;
let readFileAsync: any;
let writeFileAsync: any;
let mkdirAsync: any;
let existsAsync: any;
let readdir: any;

if (isServer) {
  // Only import these modules on the server
  fs = require('fs');
  path = require('path');
  const { promisify } = require('util');
  
  // Convert Node.js fs functions to promise-based
  readFileAsync = promisify(fs.readFile);
  writeFileAsync = promisify(fs.writeFile);
  mkdirAsync = promisify(fs.mkdir);
  existsAsync = promisify(fs.exists);
  readdir = promisify(fs.readdir);
}

/**
 * Types for SCORM package metadata
 */
export type ScormVersion = '1.2' | '2004' | 'unknown';

export interface ScormResource {
  identifier: string;
  type: string;
  href?: string;
  dependencies?: string[];
  files: string[];
}

/**
 * SCORM 2004 Navigation Control interface
 */
export interface ScormNavigationControl {
  choice?: boolean;
  choiceExit?: boolean;
  flow?: boolean;
  forwardOnly?: boolean;
  useCurrentAttemptObjectiveInfo?: boolean;
  useCurrentAttemptProgressInfo?: boolean;
}

/**
 * SCORM 2004 Completion Threshold
 */
export interface ScormCompletionThreshold {
  minProgressMeasure: number;
  progressWeight: number;
}

/**
 * SCORM 2004 Limit Conditions
 */
export interface ScormLimitConditions {
  attemptLimit?: number;
  attemptAbsoluteDurationLimit?: string;
  attemptExperiencedDurationLimit?: string;
}

/**
 * SCORM 2004 Randomization Controls
 */
export interface ScormRandomizationControls {
  randomizationTiming?: string;
  selectCount?: number;
  reorderChildren?: boolean;
  selectionTiming?: string;
}

/**
 * SCORM 2004 Delivery Controls
 */
export interface ScormDeliveryControls {
  tracked?: boolean;
  completionSetByContent?: boolean;
  objectiveSetByContent?: boolean;
}

/**
 * SCORM 2004 Rule Condition
 */
export interface ScormRuleCondition {
  referencedObjective?: string;
  measureThreshold?: number;
  operator?: string;
  condition?: string;
}

/**
 * SCORM 2004 Rule Conditions
 */
export interface ScormRuleConditions {
  conditionCombination?: string;
  ruleCondition?: ScormRuleCondition[];
}

/**
 * SCORM 2004 Sequencing Rule
 */
export interface ScormSequencingRule {
  ruleConditions?: ScormRuleConditions;
  ruleAction?: string;
}

/**
 * SCORM 2004 Rules
 */
export interface ScormRules {
  preConditionRules?: ScormSequencingRule[];
  postConditionRules?: ScormSequencingRule[];
  exitConditionRules?: ScormSequencingRule[];
}

/**
 * SCORM 2004 Map Info
 */
export interface ScormMapInfo {
  targetObjectiveID: string;
  readSatisfiedStatus?: boolean;
  readNormalizedMeasure?: boolean;
  writeSatisfiedStatus?: boolean;
  writeNormalizedMeasure?: boolean;
}

/**
 * SCORM 2004 Objective
 */
export interface ScormObjective {
  objectiveID: string;
  satisfiedByMeasure?: boolean;
  minNormalizedMeasure?: number;
  mapInfo?: ScormMapInfo[];
}

/**
 * SCORM 2004 Objectives
 */
export interface ScormObjectives {
  primaryObjective?: ScormObjective;
  objectives?: ScormObjective[];
}

/**
 * SCORM 2004 Sequencing
 */
export interface ScormSequencing {
  controlMode?: ScormNavigationControl;
  rules?: ScormRules;
  limitConditions?: ScormLimitConditions;
  objectives?: ScormObjectives;
  randomizationControls?: ScormRandomizationControls;
  deliveryControls?: ScormDeliveryControls;
  prerequisites?: string;
  timeLimitAction?: string;
  dataFromLMS?: string;
  completionThreshold?: ScormCompletionThreshold;
}

/**
 * SCORM Item interface
 */
export interface ScormItem {
  identifier: string;
  title: string;
  resourceIdentifier?: string;
  children?: ScormItem[];
  // SCORM 2004 sequencing information
  sequencing?: ScormSequencing;
}

export interface ScormManifest {
  version: ScormVersion;
  defaultOrganizationIdentifier?: string;
  organizations: {
    [identifier: string]: {
      title: string;
      items: ScormItem[];
    }
  };
  resources: {
    [identifier: string]: ScormResource;
  };
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

export interface ClientScormValidator {
  validateScormPackage: (file: File) => Promise<{
    isValid: boolean;
    manifest?: ScormManifest;
    error?: string;
  }>;
}

// ============= SERVER-SIDE FUNCTIONS =============
// All server-side functions are conditionally exported

/**
 * Extracts a SCORM zip package to the specified directory
 * @param zipPath Path to the zip file
 * @param extractPath Path where the files should be extracted
 * @returns Path to the extracted content
 */
export async function extractScormPackage(zipPath: string, extractPath: string): Promise<string> {
  if (!isServer) {
    throw new Error('This function can only be used on the server side');
  }

  try {
    // Create extraction directory if it doesn't exist
    if (!await existsAsync(extractPath)) {
      await mkdirAsync(extractPath, { recursive: true });
    }

    // Use external utility to extract the zip
    // This is a workaround for JSZip compatibility issues with Node.js Buffer
    
    // We'll use Node.js child_process to execute a zip extraction command
    // This is platform-dependent, but works for most environments
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    
    // For Windows
    if (process.platform === 'win32') {
      await execPromise(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractPath}' -Force"`);
    } 
    // For Unix-like systems (Linux, macOS)
    else {
      await execPromise(`unzip -o "${zipPath}" -d "${extractPath}"`);
    }
    
    return extractPath;
  } catch (error) {
    throw new Error(`Failed to extract SCORM package: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validates that a directory contains a valid SCORM package
 * @param extractPath Path to the extracted SCORM package
 * @returns Whether the package is valid
 */
export async function validateScormPackage(extractPath: string): Promise<boolean> {
  if (!isServer) {
    throw new Error('This function can only be used on the server side');
  }
  
  try {
    // Check for imsmanifest.xml
    const manifestPath = path.join(extractPath, 'imsmanifest.xml');
    return await existsAsync(manifestPath);
  } catch (error) {
    return false;
  }
}

/**
 * Determines the SCORM version from the manifest file
 * @param manifestPath Path to the imsmanifest.xml file
 * @returns SCORM version
 */
export async function getScormVersion(manifestPath: string): Promise<ScormVersion> {
  if (!isServer) {
    throw new Error('This function can only be used on the server side');
  }
  
  try {
    const manifestContent = await readFileAsync(manifestPath, 'utf-8');
    return determineScormVersionFromContent(manifestContent);
  } catch (error) {
    return 'unknown';
  }
}

/**
 * Parses the SCORM manifest file to extract metadata
 * @param manifestPath Path to the imsmanifest.xml file
 * @returns Parsed manifest data
 */
export async function parseScormManifest(manifestPath: string): Promise<ScormManifest> {
  if (!isServer) {
    throw new Error('This function can only be used on the server side');
  }
  
  try {
    const manifestContent = await readFileAsync(manifestPath, 'utf-8');
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    const manifestXml = await parser.parseStringPromise(manifestContent);
    
    const version = await getScormVersion(manifestPath);
    
    const result: ScormManifest = {
      version,
      organizations: {},
      resources: {}
    };
    
    // Parse metadata
    if (manifestXml.manifest.metadata) {
      const metadata = manifestXml.manifest.metadata;
      result.metadata = {
        schema: metadata.schema || undefined,
        schemaversion: metadata.schemaversion || undefined
      };
      
      // Handle different metadata structures for SCORM 1.2 vs 2004
      if (metadata.lom && metadata.lom.general) {
        const general = metadata.lom.general;
        result.metadata.title = general.title?.langstring?._ || general.title?.langstring || general.title || undefined;
        result.metadata.description = general.description?.langstring?._ || general.description?.langstring || general.description || undefined;
        
        if (general.keyword) {
          const keywords = Array.isArray(general.keyword) ? general.keyword : [general.keyword];
          result.metadata.keywords = keywords.map((k: any) => k.langstring?._ || k.langstring || k);
        }
        
        if (general.language) {
          result.metadata.language = general.language;
        }
      }
    }
    
    // Parse organizations
    if (manifestXml.manifest.organizations) {
      const organizations = manifestXml.manifest.organizations;
      result.defaultOrganizationIdentifier = organizations.default;
      
      if (organizations.organization) {
        const orgs = Array.isArray(organizations.organization) 
          ? organizations.organization 
          : [organizations.organization];
        
        for (const org of orgs) {
          const orgId = org.identifier;
          result.organizations[orgId] = {
            title: org.title,
            items: []
          };
          
          if (org.item) {
            result.organizations[orgId].items = parseItems(org.item);
          }
        }
      }
    }
    
    // Parse resources
    if (manifestXml.manifest.resources?.resource) {
      const resources = Array.isArray(manifestXml.manifest.resources.resource) 
        ? manifestXml.manifest.resources.resource 
        : [manifestXml.manifest.resources.resource];
      
      for (const resource of resources) {
        const identifier = resource.identifier;
        result.resources[identifier] = {
          identifier,
          type: resource.type,
          href: resource.href,
          files: [],
          dependencies: []
        };
        
        // Parse files
        if (resource.file) {
          const files = Array.isArray(resource.file) ? resource.file : [resource.file];
          result.resources[identifier].files = files.map((file: any) => file.href);
        }
        
        // Parse dependencies
        if (resource.dependency) {
          const dependencies = Array.isArray(resource.dependency) ? resource.dependency : [resource.dependency];
          result.resources[identifier].dependencies = dependencies.map((dep: any) => dep.identifierref);
        }
      }
    }
    
    // Find entry point
    if (result.defaultOrganizationIdentifier && result.organizations[result.defaultOrganizationIdentifier]) {
      const defaultOrg = result.organizations[result.defaultOrganizationIdentifier];
      if (defaultOrg.items.length > 0) {
        const firstItem = findFirstItemWithResource(defaultOrg.items);
        if (firstItem && firstItem.resourceIdentifier) {
          const resource = result.resources[firstItem.resourceIdentifier];
          if (resource && resource.href) {
            result.entryPoint = resource.href;
          }
        }
      }
    }
    
    // If no entry point found through organizations, try to find SCO resource
    if (!result.entryPoint) {
      for (const resourceId in result.resources) {
        const resource = result.resources[resourceId];
        if (resource.type.includes('sco') && resource.href) {
          result.entryPoint = resource.href;
          break;
        }
      }
    }
    
    return result;
  } catch (error) {
    throw new Error(`Failed to parse SCORM manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============= SHARED UTILITY FUNCTIONS =============

/**
 * Helper function to determine the SCORM version from manifest content
 */
function determineScormVersionFromContent(manifestContent: string): ScormVersion {
  // Check for SCORM 2004 indicators
  if (manifestContent.includes('http://www.imsglobal.org/xsd/imscp_v1p1') ||
      manifestContent.includes('http://www.adlnet.org/xsd/adlcp_v1p3') ||
      manifestContent.includes('adlseq_v1p3') ||
      manifestContent.includes('adlnav_v1p3')) {
    return '2004';
  }
  
  // Check for SCORM 1.2 indicators
  if (manifestContent.includes('http://www.imsproject.org/xsd/imscp_rootv1p1p2') ||
      manifestContent.includes('http://www.adlnet.org/xsd/adlcp_rootv1p2')) {
    return '1.2';
  }
  
  return 'unknown';
}

/**
 * Helper function to recursively parse SCORM items
 */
function parseItems(items: any): ScormItem[] {
  if (!items) return [];
  
  const itemsArray = Array.isArray(items) ? items : [items];
  return itemsArray.map(item => {
    const result: ScormItem = {
      identifier: item.identifier,
      title: item.title
    };
    
    if (item.identifierref) {
      result.resourceIdentifier = item.identifierref;
    }
    
    if (item.item) {
      result.children = parseItems(item.item);
    }
    
    return result;
  });
}

/**
 * Helper function to find the first item with a resource reference
 */
function findFirstItemWithResource(items: ScormItem[]): ScormItem | undefined {
  for (const item of items) {
    if (item.resourceIdentifier) {
      return item;
    }
    
    if (item.children) {
      const found = findFirstItemWithResource(item.children);
      if (found) {
        return found;
      }
    }
  }
  
  return undefined;
}

// ============= CLIENT-SIDE FUNCTIONS =============

/**
 * Creates a client-side SCORM validator for browser environments
 */
export function createClientSideValidator(): ClientScormValidator {
  return {
    validateScormPackage: async (file: File) => {
      try {
        // Load the zip file
        const zip = await JSZip.loadAsync(file);
        
        // Check for imsmanifest.xml
        const manifestFile = zip.file('imsmanifest.xml');
        if (!manifestFile) {
          return { isValid: false, error: 'Missing imsmanifest.xml file' };
        }
        
        // Read the manifest content
        const manifestContent = await manifestFile.async('string');
        
        // Determine SCORM version
        const version = determineScormVersionFromContent(manifestContent);
        
        if (version === 'unknown') {
          return { isValid: false, error: 'Unable to determine SCORM version' };
        }
        
        // Parse the manifest
        const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
        const manifestXml = await parser.parseStringPromise(manifestContent);
        
        // Create a minimal manifest object
        const manifest: ScormManifest = {
          version,
          organizations: {},
          resources: {}
        };
        
        // Extract title from metadata if available
        if (manifestXml.manifest.metadata?.lom?.general?.title) {
          const title = manifestXml.manifest.metadata.lom.general.title;
          manifest.metadata = {
            title: title.langstring?._ || title.langstring || title
          };
        }
        
        // Find the default organization
        if (manifestXml.manifest.organizations) {
          const defaultOrgId = manifestXml.manifest.organizations.default;
          manifest.defaultOrganizationIdentifier = defaultOrgId;
          
          if (manifestXml.manifest.organizations.organization) {
            const orgs = Array.isArray(manifestXml.manifest.organizations.organization) 
              ? manifestXml.manifest.organizations.organization 
              : [manifestXml.manifest.organizations.organization];
            
            for (const org of orgs) {
              if (org.identifier === defaultOrgId || !defaultOrgId) {
                manifest.organizations[org.identifier] = {
                  title: org.title,
                  items: []
                };
              }
            }
          }
        }
        
        return { isValid: true, manifest };
      } catch (error) {
        return { 
          isValid: false, 
          error: `Failed to validate SCORM package: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  };
} 

/**
 * Extract and preview SCORM package metadata client-side before upload
 * @param file SCORM zip file from file input
 * @returns Preview data with validation status and metadata
 */
export interface ScormPreviewResult {
  isValid: boolean;
  metadata?: {
    title: string;
    description?: string;
    version: ScormVersion;
    entryPoint: string;
    manifestPath: string;
  };
  error?: string;
}

export async function getClientScormPreviewDetails(file: File): Promise<ScormPreviewResult> {
  try {
    // Load the zip file
    const zip = await JSZip.loadAsync(file);
    
    // Check for imsmanifest.xml
    const manifestFile = zip.file('imsmanifest.xml');
    if (!manifestFile) {
      return { isValid: false, error: 'Missing imsmanifest.xml file' };
    }
    
    // Read the manifest content
    const manifestContent = await manifestFile.async('string');
    
    // Determine SCORM version
    const version = determineScormVersionFromContent(manifestContent);
    
    if (version === 'unknown') {
      return { isValid: false, error: 'Unable to determine SCORM version' };
    }
    
    try {
      // Parse the manifest
      const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
      const manifestXml = await parser.parseStringPromise(manifestContent);
      
      if (!manifestXml.manifest) {
        return { isValid: false, error: 'Invalid manifest structure' };
      }
      
      // Extract title and description
      let title = file.name.replace(/\.zip$/i, '');
      let description: string | undefined = undefined;
      
      // Try to extract metadata from various locations in the manifest
      if (manifestXml.manifest.metadata) {
        const metadata = manifestXml.manifest.metadata;
        
        // Try LOM metadata format
        if (metadata.lom?.general) {
          const general = metadata.lom.general;
          
          if (general.title) {
            title = general.title.langstring?._ || 
                    general.title.langstring || 
                    general.title.string?._ || 
                    general.title.string || 
                    general.title || 
                    title;
          }
          
          if (general.description) {
            description = general.description.langstring?._ || 
                          general.description.langstring || 
                          general.description.string?._ || 
                          general.description.string || 
                          general.description;
          }
        }
        // Try direct metadata format
        else if (metadata.title) {
          title = metadata.title.langstring?._ || 
                  metadata.title.langstring || 
                  metadata.title.string?._ || 
                  metadata.title.string || 
                  metadata.title || 
                  title;
                  
          if (metadata.description) {
            description = metadata.description.langstring?._ || 
                          metadata.description.langstring || 
                          metadata.description.string?._ || 
                          metadata.description.string || 
                          metadata.description;
          }
        }
      }
      
      // Try to find title in the default organization
      if (!title && manifestXml.manifest.organizations) {
        const organizations = manifestXml.manifest.organizations;
        const defaultOrgId = organizations.default;
        
        if (organizations.organization) {
          const orgs = Array.isArray(organizations.organization) 
            ? organizations.organization 
            : [organizations.organization];
          
          // Get either the default organization or the first one
          const org = orgs.find((o: any) => o.identifier === defaultOrgId) || orgs[0];
          if (org && org.title) {
            title = org.title;
          }
        }
      }
      
      // Find entry point
      let entryPoint = '';
      
      // Look for default organization's first item with a resource
      if (manifestXml.manifest.organizations && manifestXml.manifest.resources) {
        const organizations = manifestXml.manifest.organizations;
        const resources = manifestXml.manifest.resources;
        
        // Get organization items
        let items: any[] = [];
        if (organizations.organization) {
          const orgs = Array.isArray(organizations.organization) 
            ? organizations.organization 
            : [organizations.organization];
          
          // Get the default org or first one
          const defaultOrgId = organizations.default;
          const org = orgs.find((o: any) => o.identifier === defaultOrgId) || orgs[0];
          
          if (org && org.item) {
            items = Array.isArray(org.item) ? org.item : [org.item];
          }
        }
        
        // Find first item with resource reference
        let resourceId = '';
        const findResourceId = (items: any[]): string => {
          for (const item of items) {
            if (item.identifierref) {
              return item.identifierref;
            }
            if (item.item) {
              const childItems = Array.isArray(item.item) ? item.item : [item.item];
              const childId = findResourceId(childItems);
              if (childId) return childId;
            }
          }
          return '';
        };
        
        resourceId = findResourceId(items);
        
        // Get resource with this ID
        if (resourceId && resources.resource) {
          const resourcesList = Array.isArray(resources.resource) 
            ? resources.resource 
            : [resources.resource];
            
          const resource = resourcesList.find((r: any) => r.identifier === resourceId);
          
          if (resource && resource.href) {
            entryPoint = resource.href;
          }
        }
        
        // If no entry point found through organizations, try to find SCO resource
        if (!entryPoint && resources.resource) {
          const resourcesList = Array.isArray(resources.resource) 
            ? resources.resource 
            : [resources.resource];
            
          // Look for a resource with SCO type
          const scoResource = resourcesList.find((r: any) => 
            r.type && r.type.includes('sco') && r.href
          );
          
          if (scoResource && scoResource.href) {
            entryPoint = scoResource.href;
          } 
          // If no SCO found, just use the first resource with href
          else {
            const firstResource = resourcesList.find((r: any) => r.href);
            if (firstResource) {
              entryPoint = firstResource.href;
            }
          }
        }
      }
      
      if (!entryPoint) {
        return { isValid: false, error: 'No entry point found in SCORM package' };
      }
      
      // Map ScormVersion string to Prisma enum
      const mappedScormVersion = version === '1.2' ? 'SCORM_12' : 'SCORM_2004';
      
      // Return the metadata
      return {
        isValid: true,
        metadata: {
          title,
          description,
          version: mappedScormVersion as any, // Type conversion for Prisma enum
          entryPoint,
          manifestPath: 'imsmanifest.xml'
        }
      };
    } catch (parseError) {
      return { 
        isValid: false, 
        error: `Failed to parse SCORM manifest: ${parseError instanceof Error ? parseError.message : String(parseError)}` 
      };
    }
  } catch (error) {
    return { 
      isValid: false, 
      error: `Failed to process SCORM package: ${error instanceof Error ? error.message : String(error)}`
    };
  }
} 