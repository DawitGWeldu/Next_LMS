"use client";

import { useState, useEffect } from "react";
import { 
  registerScormServiceWorker, 
  isServiceWorkerSupported,
  hasActiveServiceWorkerController
} from "@/lib/client/service-worker-registry";
import { ScormPreview } from "@/components/scorm/ScormPreview";
import { ScormStructureNav } from "@/components/scorm-structure-nav";
import { toast } from "react-hot-toast";

/**
 * Test page for validating the integration between ScormStructureNav and ScormPreview
 * This page tests that the service worker extraction and caching works correctly for both components
 */
export default function ScormIntegrationTestPage() {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [packageUrl, setPackageUrl] = useState<string>("");
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const [showNav, setShowNav] = useState<boolean>(true);
  const [isServiceWorkerReady, setIsServiceWorkerReady] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [testCases, setTestCases] = useState<string[]>([
    "/test-samples/sample1.zip",
    "/test-samples/sample2.zip",
    "/test-samples/invalid.zip" // For testing error handling
  ]);

  // Initialize service worker
  useEffect(() => {
    const initServiceWorker = async () => {
      try {
        // Check if service workers are supported
        if (!isServiceWorkerSupported()) {
          setError("Service Workers are not supported in this browser.");
          return;
        }

        // Register the service worker
        const registration = await registerScormServiceWorker();
        if (!registration) {
          setError("Failed to register Service Worker.");
          return;
        }
        
        // Check if service worker is controlling this page
        if (!hasActiveServiceWorkerController()) {
          setError("Service Worker registered but not controlling this page. Try refreshing.");
          return;
        }
        
        setIsServiceWorkerReady(true);
        toast.success("Service Worker is ready!");
      } catch (err) {
        console.error("Service Worker initialization error:", err);
        setError(`Service Worker initialization error: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    
    initServiceWorker();
  }, []);

  // Handle navigation from ScormStructureNav
  const handleNavigate = (url: string) => {
    setCurrentUrl(url);
    console.log("Navigation occurred:", url);
    toast.success(`Navigated to: ${url.split('/').pop()}`);
  };

  // Handle loading a SCORM package
  const handleLoadPackage = () => {
    if (!packageUrl) {
      toast.error("Please enter a package URL");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setProgress(0);
    setCurrentUrl(null);
    
    // Simulate a delay to show progress
    setTimeout(() => {
      setIsLoading(false);
    }, 1000);
  };

  // Toggle components for testing different scenarios
  const togglePreview = () => setShowPreview(!showPreview);
  const toggleNav = () => setShowNav(!showNav);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">SCORM Integration Test Page</h1>
      
      {/* Service Worker Status */}
      <div className="mb-4 p-4 border rounded-md bg-gray-50">
        <h2 className="text-lg font-semibold mb-2">Service Worker Status</h2>
        <div className="flex items-center">
          <div 
            className={`w-3 h-3 rounded-full mr-2 ${isServiceWorkerReady ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <span>
            {isServiceWorkerReady 
              ? "Service Worker is active and controlling this page" 
              : "Service Worker is not ready"}
          </span>
        </div>
        {error && (
          <div className="mt-2 p-2 bg-red-100 text-red-800 rounded-md text-sm">
            {error}
          </div>
        )}
      </div>
      
      {/* Control Panel */}
      <div className="mb-4 p-4 border rounded-md">
        <h2 className="text-lg font-semibold mb-2">Control Panel</h2>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Package URL</label>
            <div className="flex">
              <input 
                type="text"
                value={packageUrl}
                onChange={(e) => setPackageUrl(e.target.value)}
                className="flex-1 p-2 border rounded-md mr-2"
                placeholder="Enter SCORM package URL"
              />
              <button 
                onClick={handleLoadPackage}
                disabled={isLoading || !isServiceWorkerReady}
                className="px-4 py-2 bg-blue-500 text-white rounded-md disabled:bg-gray-300"
              >
                Load
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Test Cases</label>
            <select 
              onChange={(e) => setPackageUrl(e.target.value)}
              className="w-full p-2 border rounded-md"
            >
              <option value="">Select a test case</option>
              {testCases.map((testCase) => (
                <option key={testCase} value={testCase}>
                  {testCase}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="flex space-x-4">
          <label className="flex items-center">
            <input 
              type="checkbox" 
              checked={showPreview} 
              onChange={togglePreview}
              className="mr-2"
            />
            Show ScormPreview
          </label>
          
          <label className="flex items-center">
            <input 
              type="checkbox" 
              checked={showNav} 
              onChange={toggleNav}
              className="mr-2"
            />
            Show ScormStructureNav
          </label>
        </div>
      </div>
      
      {/* Test Status */}
      {isLoading && (
        <div className="mb-4 p-4 border rounded-md bg-blue-50">
          <h2 className="text-lg font-semibold mb-2">Loading Package...</h2>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="mt-1 text-sm text-center">
            {Math.round(progress * 100)}%
          </div>
        </div>
      )}
      
      {/* Component Display */}
      {packageUrl && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Navigation panel */}
          {showNav && (
            <div className="lg:col-span-1 border rounded-md p-4 bg-white">
              <h2 className="text-lg font-semibold mb-4">Navigation Structure</h2>
              <div className="border rounded-md h-[600px] overflow-y-auto p-2">
                <ScormStructureNav 
                  courseId="test-course"
                  scormPackageId="test-package"
                  scormUrl={packageUrl}
                  onNavigate={handleNavigate}
                />
              </div>
            </div>
          )}
          
          {/* Content display */}
          {showPreview && (
            <div className={`${showNav ? 'lg:col-span-2' : 'lg:col-span-3'} border rounded-md p-4 bg-white`}>
              <h2 className="text-lg font-semibold mb-4">Content Preview</h2>
              <div className="border rounded-md h-[600px] overflow-hidden">
                {currentUrl ? (
                  <iframe 
                    src={currentUrl}
                    className="w-full h-full border-0"
                    title="SCORM Content"
                  />
                ) : (
                  <ScormPreview 
                    packageUrl={packageUrl}
                    onProgress={(progress) => setProgress(progress)}
                    onError={(err) => {
                      setError(`ScormPreview error: ${err.message}`);
                      setIsLoading(false);
                    }}
                    onLoad={() => {
                      setIsLoading(false);
                      toast.success("SCORM package loaded successfully!");
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Test Results and Logs */}
      <div className="mt-4 p-4 border rounded-md">
        <h2 className="text-lg font-semibold mb-2">Test Results</h2>
        <div className="bg-gray-800 text-green-400 p-4 rounded-md font-mono text-sm h-40 overflow-y-auto">
          <div>
            {isServiceWorkerReady ? '✅' : '❌'} Service Worker Initialization
          </div>
          <div>
            {showPreview && packageUrl ? '✅' : '❌'} ScormPreview Component
          </div>
          <div>
            {showNav && packageUrl ? '✅' : '❌'} ScormStructureNav Component
          </div>
          <div>
            {currentUrl ? '✅' : '❌'} Navigation between components
          </div>
          <div>
            {error ? `❌ Errors: ${error}` : '✅ No errors'}
          </div>
        </div>
      </div>
    </div>
  );
} 