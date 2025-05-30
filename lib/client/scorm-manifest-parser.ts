import xml2js from 'xml2js';
import { ScormItem, ScormManifest, ScormVersion, ScormResource, ScormSequencing, ScormNavigationControl } from '@/lib/scorm';

/**
 * Determines the SCORM version from manifest content
 * @param manifestContent XML content of the manifest file
 * @returns The SCORM version
 */
export function determineScormVersionFromContent(manifestContent: string): ScormVersion {
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
 * Parse SCORM manifest content
 * @param manifestContent XML content of imsmanifest.xml
 * @returns Parsed manifest data
 */
export async function parseManifestContent(manifestContent: string): Promise<ScormManifest> {
  try {
    // Determine the SCORM version
    const version = determineScormVersionFromContent(manifestContent);
    
    // Parse the XML
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    const manifestXml = await parser.parseStringPromise(manifestContent);
    
    // Create the base manifest structure
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
            // Parse items including sequencing rules for SCORM 2004
            result.organizations[orgId].items = parseItems(org.item, version);
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

/**
 * Parse SCORM items from manifest
 * @param items Items from the manifest
 * @param version SCORM version
 * @returns Array of parsed items
 */
function parseItems(items: any, version: ScormVersion): ScormItem[] {
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
      result.children = parseItems(item.item, version);
    }
    
    // Parse SCORM 2004 specific sequencing and navigation rules
    if (version === '2004') {
      // Parse sequencing rules if present
      if (item.sequencing) {
        result.sequencing = parseSequencing(item.sequencing);
      }
      
      // Parse adlcp:prerequisites if present (legacy from SCORM 1.2 but may be in 2004)
      if (item.prerequisites) {
        if (!result.sequencing) {
          result.sequencing = {};
        }
        result.sequencing.prerequisites = item.prerequisites;
      }
      
      // Parse timeLimitAction
      if (item.timeLimitAction) {
        if (!result.sequencing) {
          result.sequencing = {};
        }
        result.sequencing.timeLimitAction = item.timeLimitAction;
      }
      
      // Parse dataFromLMS
      if (item.dataFromLMS) {
        if (!result.sequencing) {
          result.sequencing = {};
        }
        result.sequencing.dataFromLMS = item.dataFromLMS;
      }
      
      // Parse completionThreshold
      if (item.completionThreshold) {
        if (!result.sequencing) {
          result.sequencing = {};
        }
        result.sequencing.completionThreshold = {
          minProgressMeasure: parseFloat(item.completionThreshold.minProgressMeasure) || 0,
          progressWeight: parseFloat(item.completionThreshold.progressWeight) || 1.0
        };
      }
    }
    
    return result;
  });
}

/**
 * Parse SCORM 2004 sequencing information
 * @param sequencing Sequencing data from manifest
 * @returns Parsed sequencing rules
 */
function parseSequencing(sequencing: any): ScormSequencing {
  const result: ScormSequencing = {};
  
  // Parse control mode
  if (sequencing.controlMode) {
    result.controlMode = {
      choice: sequencing.controlMode.choice === 'true',
      choiceExit: sequencing.controlMode.choiceExit === 'true',
      flow: sequencing.controlMode.flow === 'true',
      forwardOnly: sequencing.controlMode.forwardOnly === 'true',
      useCurrentAttemptObjectiveInfo: sequencing.controlMode.useCurrentAttemptObjectiveInfo === 'true',
      useCurrentAttemptProgressInfo: sequencing.controlMode.useCurrentAttemptProgressInfo === 'true'
    };
  }
  
  // Parse rules
  if (sequencing.rules) {
    result.rules = {
      preConditionRules: parseRules(sequencing.rules.preConditionRule),
      postConditionRules: parseRules(sequencing.rules.postConditionRule),
      exitConditionRules: parseRules(sequencing.rules.exitConditionRule)
    };
  }
  
  // Parse limit conditions
  if (sequencing.limitConditions) {
    result.limitConditions = {
      attemptLimit: parseInt(sequencing.limitConditions.attemptLimit) || 0,
      attemptAbsoluteDurationLimit: sequencing.limitConditions.attemptAbsoluteDurationLimit,
      attemptExperiencedDurationLimit: sequencing.limitConditions.attemptExperiencedDurationLimit
    };
  }
  
  // Parse objectives
  if (sequencing.objectives) {
    result.objectives = parseObjectives(sequencing.objectives);
  }
  
  // Parse randomization controls
  if (sequencing.randomizationControls) {
    result.randomizationControls = {
      randomizationTiming: sequencing.randomizationControls.randomizationTiming,
      selectCount: parseInt(sequencing.randomizationControls.selectCount) || 0,
      reorderChildren: sequencing.randomizationControls.reorderChildren === 'true',
      selectionTiming: sequencing.randomizationControls.selectionTiming
    };
  }
  
  // Parse delivery controls
  if (sequencing.deliveryControls) {
    result.deliveryControls = {
      tracked: sequencing.deliveryControls.tracked === 'true',
      completionSetByContent: sequencing.deliveryControls.completionSetByContent === 'true',
      objectiveSetByContent: sequencing.deliveryControls.objectiveSetByContent === 'true'
    };
  }
  
  return result;
}

/**
 * Parse sequencing rules
 * @param rules Rules from the manifest
 * @returns Parsed rules array
 */
function parseRules(rules: any): any[] {
  if (!rules) return [];
  
  const rulesArray = Array.isArray(rules) ? rules : [rules];
  return rulesArray.map(rule => ({
    ruleConditions: parseRuleConditions(rule.ruleConditions),
    ruleAction: rule.ruleAction?.action
  }));
}

/**
 * Parse rule conditions
 * @param conditions Rule conditions from the manifest
 * @returns Parsed conditions
 */
function parseRuleConditions(conditions: any): any {
  if (!conditions) return {};
  
  return {
    conditionCombination: conditions.conditionCombination || 'all',
    ruleCondition: parseCondition(conditions.ruleCondition)
  };
}

/**
 * Parse a single condition
 * @param condition Condition from the manifest
 * @returns Parsed condition
 */
function parseCondition(condition: any): any[] {
  if (!condition) return [];
  
  const conditionsArray = Array.isArray(condition) ? condition : [condition];
  return conditionsArray.map(c => ({
    referencedObjective: c.referencedObjective,
    measureThreshold: parseFloat(c.measureThreshold) || 0,
    operator: c.operator,
    condition: c.condition
  }));
}

/**
 * Parse objectives
 * @param objectives Objectives from the manifest
 * @returns Parsed objectives
 */
function parseObjectives(objectives: any): any {
  if (!objectives || !objectives.primaryObjective && !objectives.objective) {
    return {};
  }
  
  const result: any = {};
  
  // Parse primary objective
  if (objectives.primaryObjective) {
    result.primaryObjective = {
      objectiveID: objectives.primaryObjective.objectiveID,
      satisfiedByMeasure: objectives.primaryObjective.satisfiedByMeasure === 'true',
      minNormalizedMeasure: parseFloat(objectives.primaryObjective.minNormalizedMeasure) || 0,
      mapInfo: parseMapInfo(objectives.primaryObjective.mapInfo)
    };
  }
  
  // Parse other objectives
  if (objectives.objective) {
    const objectivesArray = Array.isArray(objectives.objective) ? objectives.objective : [objectives.objective];
    result.objectives = objectivesArray.map((obj: any) => ({
      objectiveID: obj.objectiveID,
      satisfiedByMeasure: obj.satisfiedByMeasure === 'true',
      minNormalizedMeasure: parseFloat(obj.minNormalizedMeasure) || 0,
      mapInfo: parseMapInfo(obj.mapInfo)
    }));
  }
  
  return result;
}

/**
 * Parse map info
 * @param mapInfo Map info from the manifest
 * @returns Parsed map info
 */
function parseMapInfo(mapInfo: any): any[] {
  if (!mapInfo) return [];
  
  const mapInfoArray = Array.isArray(mapInfo) ? mapInfo : [mapInfo];
  return mapInfoArray.map(info => ({
    targetObjectiveID: info.targetObjectiveID,
    readSatisfiedStatus: info.readSatisfiedStatus === 'true',
    readNormalizedMeasure: info.readNormalizedMeasure === 'true',
    writeSatisfiedStatus: info.writeSatisfiedStatus === 'true',
    writeNormalizedMeasure: info.writeNormalizedMeasure === 'true'
  }));
}

/**
 * Find the first item with a resource reference
 * @param items Array of SCORM items
 * @returns The first item with a resource reference, or undefined if none found
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

/**
 * Flattens the hierarchical structure of SCORM items into a linear array
 * @param items Array of SCORM items
 * @returns Flattened array of all items
 */
export function flattenScormItems(items: ScormItem[]): ScormItem[] {
  const result: ScormItem[] = [];
  
  const processItems = (itemsToProcess: ScormItem[]) => {
    for (const item of itemsToProcess) {
      result.push(item);
      
      if (item.children && item.children.length > 0) {
        processItems(item.children);
      }
    }
  };
  
  processItems(items);
  return result;
}

/**
 * Finds all leaf nodes (items without children) in the SCORM structure
 * @param items Array of SCORM items
 * @returns Array of all leaf node items
 */
export function findLeafNodes(items: ScormItem[]): ScormItem[] {
  const result: ScormItem[] = [];
  
  const processItems = (itemsToProcess: ScormItem[]) => {
    for (const item of itemsToProcess) {
      if (!item.children || item.children.length === 0) {
        result.push(item);
      } else {
        processItems(item.children);
      }
    }
  };
  
  processItems(items);
  return result;
}

/**
 * Finds an item by its identifier
 * @param items Array of SCORM items
 * @param identifier The identifier to search for
 * @returns The found item or undefined
 */
export function findItemById(items: ScormItem[], identifier: string): ScormItem | undefined {
  for (const item of items) {
    if (item.identifier === identifier) {
      return item;
    }
    
    if (item.children) {
      const found = findItemById(item.children, identifier);
      if (found) {
        return found;
      }
    }
  }
  
  return undefined;
}

/**
 * Finds the parent of an item with the given identifier
 * @param items Array of SCORM items
 * @param identifier The identifier of the item to find the parent for
 * @returns The parent item or undefined
 */
export function findItemParent(items: ScormItem[], identifier: string): ScormItem | undefined {
  for (const item of items) {
    if (item.children) {
      for (const child of item.children) {
        if (child.identifier === identifier) {
          return item;
        }
      }
      
      const found = findItemParent(item.children, identifier);
      if (found) {
        return found;
      }
    }
  }
  
  return undefined;
}

/**
 * Builds a breadcrumb path to an item
 * @param items Root array of SCORM items
 * @param identifier The identifier of the item to find
 * @returns Array of items forming a path to the target item
 */
export function buildItemPath(items: ScormItem[], identifier: string): ScormItem[] {
  const path: ScormItem[] = [];
  
  const findPath = (currentItems: ScormItem[], targetId: string): boolean => {
    for (const item of currentItems) {
      if (item.identifier === targetId) {
        path.push(item);
        return true;
      }
      
      if (item.children) {
        const found = findPath(item.children, targetId);
        if (found) {
          path.unshift(item);
          return true;
        }
      }
    }
    
    return false;
  };
  
  findPath(items, identifier);
  return path;
}

/**
 * Evaluates SCORM 2004 sequencing rules to determine if a navigation request is valid
 * @param items Array of SCORM items
 * @param fromItem Current item identifier
 * @param toItem Target item identifier
 * @param manifest Complete SCORM manifest
 * @returns Whether the navigation is allowed by sequencing rules
 */
export function isNavigationAllowed(
  items: ScormItem[],
  fromItem: string,
  toItem: string,
  manifest: ScormManifest
): boolean {
  // For non-SCORM 2004, always allow navigation
  if (manifest.version !== '2004') {
    return true;
  }
  
  const currentItem = findItemById(items, fromItem);
  const targetItem = findItemById(items, toItem);
  
  if (!currentItem || !targetItem) {
    return false;
  }
  
  // Check if forward-only navigation is enforced
  const isForwardNavigation = isNavigationForward(items, fromItem, toItem);
  
  // Check parent items for sequencing control restrictions
  const currentPath = buildItemPath(items, fromItem);
  const targetPath = buildItemPath(items, toItem);
  
  // Check if we're within the same branch or crossing branches
  const isSameBranch = shareCommonParent(currentPath, targetPath);
  
  // Check control mode restrictions in effect
  // Start with the most specific (current item's parent) and move up the hierarchy
  for (const pathItem of [...currentPath].reverse()) {
    if (pathItem.sequencing?.controlMode) {
      const controlMode = pathItem.sequencing.controlMode;
      
      // If choice is disabled, only allow navigation to next/previous item
      if (controlMode.choice === false) {
        if (!isAdjacentItem(items, fromItem, toItem)) {
          return false;
        }
      }
      
      // If forwardOnly is enabled, only allow forward navigation
      if (controlMode.forwardOnly === true && !isForwardNavigation) {
        return false;
      }
      
      // If flow is disabled, require explicit choice navigation
      if (controlMode.flow === false) {
        // Potentially restrict automatic forward/backward flow
        // This may require runtime tracking of navigation type
        // We'll simplify for now and allow it
      }
    }
    
    // Check sequencing rules (pre-condition rules can block navigation)
    if (pathItem.sequencing?.rules?.preConditionRules) {
      // Implementation would depend on runtime tracking of rule state
      // This would require additional tracking data from the SCORM API
      // Simplified implementation for now - would need actual rule evaluation
    }
  }
  
  return true;
}

/**
 * Determines if one item is adjacent (next or previous) to another in the flattened sequence
 * @param items Root array of SCORM items
 * @param fromItem Current item identifier  
 * @param toItem Target item identifier
 * @returns Whether the target item is adjacent to the current item
 */
function isAdjacentItem(items: ScormItem[], fromItem: string, toItem: string): boolean {
  const flatItems = flattenScormItems(items);
  
  for (let i = 0; i < flatItems.length; i++) {
    if (flatItems[i].identifier === fromItem) {
      // Check if target is previous item
      if (i > 0 && flatItems[i-1].identifier === toItem) {
        return true;
      }
      
      // Check if target is next item
      if (i < flatItems.length - 1 && flatItems[i+1].identifier === toItem) {
        return true;
      }
      
      return false;
    }
  }
  
  return false;
}

/**
 * Determines if a navigation request is moving forward in the content structure
 * @param items Root array of SCORM items
 * @param fromItem Current item identifier
 * @param toItem Target item identifier
 * @returns Whether the navigation is forward in sequence
 */
function isNavigationForward(items: ScormItem[], fromItem: string, toItem: string): boolean {
  const flatItems = flattenScormItems(items);
  
  let fromIndex = -1;
  let toIndex = -1;
  
  for (let i = 0; i < flatItems.length; i++) {
    if (flatItems[i].identifier === fromItem) {
      fromIndex = i;
    }
    if (flatItems[i].identifier === toItem) {
      toIndex = i;
    }
  }
  
  return fromIndex < toIndex;
}

/**
 * Determines if two items share a common parent in their paths
 * @param path1 Path to first item
 * @param path2 Path to second item
 * @returns Whether the items share a common parent
 */
function shareCommonParent(path1: ScormItem[], path2: ScormItem[]): boolean {
  if (path1.length === 0 || path2.length === 0) {
    return false;
  }
  
  // Compare all but the last item (which is the item itself)
  const parent1 = path1.length > 1 ? path1.slice(0, -1) : [];
  const parent2 = path2.length > 1 ? path2.slice(0, -1) : [];
  
  // If either has no parents, they only share the root
  if (parent1.length === 0 || parent2.length === 0) {
    return true; // They share the root as common parent
  }
  
  // Check for a common parent
  for (const p1item of parent1) {
    for (const p2item of parent2) {
      if (p1item.identifier === p2item.identifier) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Finds the next item in the sequence based on sequencing rules
 * @param items Root array of SCORM items
 * @param currentIdentifier The identifier of the current item
 * @param manifest Complete SCORM manifest
 * @returns The next item according to sequencing rules, or undefined if at the end
 */
export function findNextItem(
  items: ScormItem[],
  currentIdentifier: string,
  manifest?: ScormManifest
): ScormItem | undefined {
  const flatItems = flattenScormItems(items);
  
  for (let i = 0; i < flatItems.length - 1; i++) {
    if (flatItems[i].identifier === currentIdentifier) {
      const candidateNext = flatItems[i + 1];
      
      // If no manifest or not SCORM 2004, simply return the next item
      if (!manifest || manifest.version !== '2004') {
        return candidateNext;
      }
      
      // For SCORM 2004, check if navigation to the next item is allowed
      if (isNavigationAllowed(items, currentIdentifier, candidateNext.identifier, manifest)) {
        return candidateNext;
      }
      
      // If direct next is not allowed, look for the next allowed item
      for (let j = i + 2; j < flatItems.length; j++) {
        if (isNavigationAllowed(items, currentIdentifier, flatItems[j].identifier, manifest)) {
          return flatItems[j];
        }
      }
      
      // No allowed next item found
      return undefined;
    }
  }
  
  return undefined;
}

/**
 * Finds the previous item in the sequence based on sequencing rules
 * @param items Root array of SCORM items
 * @param currentIdentifier The identifier of the current item
 * @param manifest Complete SCORM manifest
 * @returns The previous item according to sequencing rules, or undefined if at the beginning
 */
export function findPreviousItem(
  items: ScormItem[],
  currentIdentifier: string,
  manifest?: ScormManifest
): ScormItem | undefined {
  const flatItems = flattenScormItems(items);
  
  for (let i = 1; i < flatItems.length; i++) {
    if (flatItems[i].identifier === currentIdentifier) {
      const candidatePrev = flatItems[i - 1];
      
      // If no manifest or not SCORM 2004, simply return the previous item
      if (!manifest || manifest.version !== '2004') {
        return candidatePrev;
      }
      
      // For SCORM 2004, check if navigation to the previous item is allowed
      if (isNavigationAllowed(items, currentIdentifier, candidatePrev.identifier, manifest)) {
        return candidatePrev;
      }
      
      // If direct previous is not allowed, look for the previous allowed item
      for (let j = i - 2; j >= 0; j--) {
        if (isNavigationAllowed(items, currentIdentifier, flatItems[j].identifier, manifest)) {
          return flatItems[j];
        }
      }
      
      // No allowed previous item found
      return undefined;
    }
  }
  
  return undefined;
}

/**
 * Gets detailed information about all resources in the manifest
 * @param manifest The SCORM manifest
 * @returns Array of resources with additional usage information
 */
export function getResourcesWithDetails(manifest: ScormManifest): Array<ScormResource & { usedByItems: string[] }> {
  const result: Array<ScormResource & { usedByItems: string[] }> = [];
  
  // Find all items that use each resource
  const itemsByResourceId: Record<string, string[]> = {};
  
  for (const orgId in manifest.organizations) {
    const org = manifest.organizations[orgId];
    
    const processItems = (items: ScormItem[], parentPath: string = '') => {
      for (const item of items) {
        const currentPath = parentPath ? `${parentPath} > ${item.title}` : item.title;
        
        if (item.resourceIdentifier) {
          if (!itemsByResourceId[item.resourceIdentifier]) {
            itemsByResourceId[item.resourceIdentifier] = [];
          }
          itemsByResourceId[item.resourceIdentifier].push(currentPath);
        }
        
        if (item.children) {
          processItems(item.children, currentPath);
        }
      }
    };
    
    processItems(org.items);
  }
  
  // Create the result with resource details
  for (const resId in manifest.resources) {
    const resource = manifest.resources[resId];
    
    result.push({
      ...resource,
      usedByItems: itemsByResourceId[resId] || []
    });
  }
  
  return result;
}

/**
 * Creates a table of contents structure from the manifest
 * @param manifest The SCORM manifest
 * @returns Array of items with their levels for display in a TOC
 */
export function createTableOfContents(manifest: ScormManifest): Array<{ item: ScormItem, level: number, hasContent: boolean }> {
  const result: Array<{ item: ScormItem, level: number, hasContent: boolean }> = [];
  
  // Default organization
  const orgId = manifest.defaultOrganizationIdentifier;
  if (!orgId || !manifest.organizations[orgId]) {
    return result;
  }
  
  const org = manifest.organizations[orgId];
  
  // Process items recursively
  const processItems = (items: ScormItem[], level: number = 0) => {
    for (const item of items) {
      const hasContent = !!item.resourceIdentifier && 
                         !!manifest.resources[item.resourceIdentifier]?.href;
      
      result.push({
        item,
        level,
        hasContent
      });
      
      if (item.children) {
        processItems(item.children, level + 1);
      }
    }
  };
  
  processItems(org.items);
  return result;
}

/**
 * Validates a SCORM manifest for consistency and required elements
 * @param manifest The SCORM manifest to validate
 * @returns Validation result with any errors
 */
export function validateScormManifest(manifest: ScormManifest): { isValid: boolean, errors: string[] } {
  const errors: string[] = [];
  
  // Check if there's at least one organization
  if (Object.keys(manifest.organizations).length === 0) {
    errors.push('No organizations found in the manifest');
  }
  
  // Check if the default organization exists
  if (manifest.defaultOrganizationIdentifier && 
      !manifest.organizations[manifest.defaultOrganizationIdentifier]) {
    errors.push('Default organization not found');
  }
  
  // Check if there's at least one resource
  if (Object.keys(manifest.resources).length === 0) {
    errors.push('No resources found in the manifest');
  }
  
  // Check resource references
  for (const orgId in manifest.organizations) {
    const org = manifest.organizations[orgId];
    
    const checkItemResources = (items: ScormItem[]) => {
      for (const item of items) {
        if (item.resourceIdentifier && !manifest.resources[item.resourceIdentifier]) {
          errors.push(`Resource '${item.resourceIdentifier}' referenced by item '${item.identifier}' not found`);
        }
        
        if (item.children) {
          checkItemResources(item.children);
        }
      }
    };
    
    checkItemResources(org.items);
  }
  
  // Check resource dependencies
  for (const resId in manifest.resources) {
    const resource = manifest.resources[resId];
    
    if (resource.dependencies) {
      for (const depId of resource.dependencies) {
        if (!manifest.resources[depId]) {
          errors.push(`Dependency '${depId}' of resource '${resId}' not found`);
        }
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
} 