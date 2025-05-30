"use client";

import { extractAndWaitForCompletion, ProgressInfo } from "@/lib/client/service-worker-registry";

/**
 * Simulated SCORM package information for testing
 */
export interface SimulatedPackage {
  name: string;
  size: number; // in bytes
  url: string;
  fileCount: number;
  type: 'SCORM_1.2' | 'SCORM_2004';
  expectedExtractionTime?: number; // in ms
}

/**
 * Test packages of various sizes and types
 */
export const TEST_PACKAGES: SimulatedPackage[] = [
  {
    name: "Small SCORM 1.2 Package",
    size: 500 * 1024, // 500 KB
    url: "https://utfs.io/f/4219c0b2-f1c6-4ea1-9c66-5635e0103c32-nwg8cg.zip", // Replace with actual test URL
    fileCount: 15,
    type: 'SCORM_1.2',
    expectedExtractionTime: 3000 // 3 seconds
  },
  {
    name: "Medium SCORM 1.2 Package",
    size: 5 * 1024 * 1024, // 5 MB
    url: "https://utfs.io/f/4219c0b2-f1c6-4ea1-9c66-5635e0103c32-nwg8cg.zip", // Replace with actual test URL
    fileCount: 50,
    type: 'SCORM_1.2',
    expectedExtractionTime: 10000 // 10 seconds
  },
  {
    name: "Large SCORM 1.2 Package",
    size: 20 * 1024 * 1024, // 20 MB
    url: "https://utfs.io/f/4219c0b2-f1c6-4ea1-9c66-5635e0103c32-nwg8cg.zip", // Replace with actual test URL
    fileCount: 200,
    type: 'SCORM_1.2',
    expectedExtractionTime: 30000 // 30 seconds
  },
  {
    name: "Small SCORM 2004 Package",
    size: 800 * 1024, // 800 KB
    url: "https://utfs.io/f/4219c0b2-f1c6-4ea1-9c66-5635e0103c32-nwg8cg.zip", // Replace with actual test URL
    fileCount: 25,
    type: 'SCORM_2004',
    expectedExtractionTime: 5000 // 5 seconds
  },
  {
    name: "Medium SCORM 2004 Package",
    size: 8 * 1024 * 1024, // 8 MB
    url: "https://utfs.io/f/4219c0b2-f1c6-4ea1-9c66-5635e0103c32-nwg8cg.zip", // Replace with actual test URL
    fileCount: 100,
    type: 'SCORM_2004',
    expectedExtractionTime: 15000 // 15 seconds
  }
];

/**
 * Progress event data for testing
 */
export interface ProgressEvent {
  timestamp: number;
  progress: number;
  stage?: string;
  processedFiles?: number;
  fileCount?: number;
  elapsedTime?: number;
}

/**
 * Test results for a SCORM package extraction
 */
export interface TestResult {
  packageName: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  error?: string;
  progressEvents: ProgressEvent[];
  stageProgression: string[];
  progressUpdatesReceived: number;
  maxTimeBetweenUpdates: number;
  avgTimeBetweenUpdates: number;
  consistentFileCount: boolean;
  missingStages: string[];
}

/**
 * Test the SCORM progress indicator with a specific package
 * @param packageInfo The package to test
 * @param key Optional key for caching
 * @param networkCondition Optional network condition to simulate
 * @returns Test results
 */
export async function testScormProgressIndicator(
  packageInfo: SimulatedPackage,
  key?: string,
  networkCondition: 'fast' | 'slow' | 'normal' = 'normal'
): Promise<TestResult> {
  // Setup test result object
  const result: TestResult = {
    packageName: packageInfo.name,
    startTime: Date.now(),
    endTime: 0,
    duration: 0,
    success: false,
    progressEvents: [],
    stageProgression: [],
    progressUpdatesReceived: 0,
    maxTimeBetweenUpdates: 0,
    avgTimeBetweenUpdates: 0,
    consistentFileCount: true,
    missingStages: []
  };
  
  // Apply network condition throttling if requested
  if (networkCondition !== 'normal') {
    console.log(`Simulating ${networkCondition} network conditions`);
    // In a real implementation, we would throttle the network here
    // This is just a placeholder since browser JS can't directly throttle network
  }
  
  // Generate a unique key if not provided
  const testKey = key || `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Track last update time for calculating time between updates
    let lastUpdateTime = Date.now();
    let maxTimeBetween = 0;
    let sumTimeBetween = 0;
    let updateCount = 0;
    let lastFileCount = 0;
    
    // Start extraction
    const extractionResult = await extractAndWaitForCompletion(
      packageInfo.url,
      testKey,
      (progress, progressInfo) => {
        const now = Date.now();
        
        // Calculate time since last update
        const timeSinceLastUpdate = now - lastUpdateTime;
        if (updateCount > 0) {
          maxTimeBetween = Math.max(maxTimeBetween, timeSinceLastUpdate);
          sumTimeBetween += timeSinceLastUpdate;
        }
        
        // Track progress event
        const progressEvent: ProgressEvent = {
          timestamp: now,
          progress,
          stage: progressInfo?.stage,
          processedFiles: progressInfo?.processedFiles,
          fileCount: progressInfo?.fileCount,
          elapsedTime: progressInfo?.elapsedTime
        };
        
        result.progressEvents.push(progressEvent);
        
        // Track stage progression
        if (progressInfo?.stage && !result.stageProgression.includes(progressInfo.stage)) {
          result.stageProgression.push(progressInfo.stage);
        }
        
        // Check file count consistency
        if (progressInfo?.fileCount && lastFileCount > 0 && progressInfo.fileCount !== lastFileCount) {
          result.consistentFileCount = false;
        }
        
        // Update tracking variables
        lastUpdateTime = now;
        updateCount++;
        if (progressInfo?.fileCount) {
          lastFileCount = progressInfo.fileCount;
        }
        
        console.log(`Progress update: ${Math.round(progress * 100)}%, stage: ${progressInfo?.stage || 'unknown'}`);
      }
    );
    
    // Record test completion
    result.endTime = Date.now();
    result.duration = result.endTime - result.startTime;
    result.success = extractionResult.success;
    result.progressUpdatesReceived = updateCount;
    
    // Calculate statistics
    if (updateCount > 1) {
      result.avgTimeBetweenUpdates = sumTimeBetween / (updateCount - 1);
    }
    result.maxTimeBetweenUpdates = maxTimeBetween;
    
    // Check for missing stages
    const expectedStages = ['download', 'processing', 'extraction', 'complete'];
    result.missingStages = expectedStages.filter(stage => 
      !result.stageProgression.some(s => s.toLowerCase().includes(stage.toLowerCase()))
    );
    
    return result;
  } catch (error) {
    // Handle errors
    result.endTime = Date.now();
    result.duration = result.endTime - result.startTime;
    result.success = false;
    result.error = error instanceof Error ? error.message : String(error);
    
    return result;
  }
}

/**
 * Run all tests and generate a comprehensive report
 */
export async function runAllProgressIndicatorTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  for (const packageInfo of TEST_PACKAGES) {
    console.log(`Testing package: ${packageInfo.name}`);
    const result = await testScormProgressIndicator(packageInfo);
    results.push(result);
    
    // Wait a bit between tests to avoid overwhelming the browser
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Generate summary report
  console.log("===== TEST SUMMARY =====");
  results.forEach(result => {
    console.log(`${result.packageName}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`  Duration: ${result.duration}ms`);
    console.log(`  Progress updates: ${result.progressUpdatesReceived}`);
    console.log(`  Stages: ${result.stageProgression.join(' -> ')}`);
    console.log(`  Missing stages: ${result.missingStages.length ? result.missingStages.join(', ') : 'None'}`);
    console.log(`  Avg time between updates: ${Math.round(result.avgTimeBetweenUpdates)}ms`);
    console.log(`  Max time between updates: ${result.maxTimeBetweenUpdates}ms`);
    console.log(`  File count consistent: ${result.consistentFileCount ? 'Yes' : 'No'}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    console.log('-------------------');
  });
  
  return results;
}

/**
 * Format a test result as HTML for display
 */
export function formatTestResultAsHtml(result: TestResult): string {
  const statusClass = result.success ? 'text-green-600' : 'text-red-600';
  const statusText = result.success ? 'SUCCESS' : 'FAILED';
  
  return `
    <div class="border rounded p-4 mb-4">
      <h3 class="text-lg font-medium">${result.packageName}</h3>
      <p class="mb-2 ${statusClass} font-bold">${statusText}</p>
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div>Duration:</div>
        <div>${result.duration}ms</div>
        
        <div>Progress updates:</div>
        <div>${result.progressUpdatesReceived}</div>
        
        <div>Stages:</div>
        <div>${result.stageProgression.join(' → ')}</div>
        
        <div>Missing stages:</div>
        <div>${result.missingStages.length ? result.missingStages.join(', ') : 'None'}</div>
        
        <div>Avg time between updates:</div>
        <div>${Math.round(result.avgTimeBetweenUpdates)}ms</div>
        
        <div>Max time between updates:</div>
        <div>${result.maxTimeBetweenUpdates}ms</div>
        
        <div>File count consistent:</div>
        <div>${result.consistentFileCount ? 'Yes' : 'No'}</div>
        
        ${result.error ? `<div>Error:</div><div class="text-red-600">${result.error}</div>` : ''}
      </div>
      
      <div class="mt-4">
        <h4 class="font-medium mb-2">Progress Chart</h4>
        <div class="h-32 bg-gray-100 relative rounded overflow-hidden">
          ${result.progressEvents.map((event, index) => {
            const left = (index / result.progressEvents.length * 100).toFixed(2);
            const height = (event.progress * 100).toFixed(2);
            const stageColor = getStageColor(event.stage);
            
            return `
              <div 
                class="absolute bottom-0 w-1 ${stageColor}"
                style="left: ${left}%; height: ${height}%; min-height: 1px;"
                title="${event.stage || 'unknown'}: ${Math.round(event.progress * 100)}%"
              ></div>
            `;
          }).join('')}
        </div>
        <div class="flex text-xs justify-between mt-1">
          <div>Start</div>
          <div>End</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Get a CSS color class based on stage
 */
function getStageColor(stage?: string): string {
  if (!stage) return 'bg-gray-500';
  
  const stageKey = stage.toLowerCase();
  
  if (stageKey.includes('download')) return 'bg-sky-500';
  if (stageKey.includes('process')) return 'bg-indigo-600';
  if (stageKey.includes('extract')) return 'bg-blue-600';
  if (stageKey.includes('complete')) return 'bg-green-500';
  
  return 'bg-gray-500';
} 