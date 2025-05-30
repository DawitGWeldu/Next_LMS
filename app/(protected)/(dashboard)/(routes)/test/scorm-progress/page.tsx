"use client";

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle, AlertCircle, Clock, Server, Download, Package, FileText } from 'lucide-react';
import { SimulatedPackage, TestResult, testScormProgressIndicator, formatTestResultAsHtml } from '@/lib/client/scorm-test-utils';

export default function ScormProgressTestPage() {
  const [packages, setPackages] = useState<(SimulatedPackage & { id: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('packages');
  
  // State for test execution
  const [runningTestId, setRunningTestId] = useState<number | null>(null);
  const [networkCondition, setNetworkCondition] = useState<'fast' | 'slow' | 'normal'>('normal');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  
  // Fetch test packages on component mount
  useEffect(() => {
    const fetchPackages = async () => {
      try {
        const response = await fetch('/api/test/scorm-progress');
        const data = await response.json();
        
        if (data.packages) {
          setPackages(data.packages);
        } else {
          setError('Invalid response format');
        }
      } catch (error) {
        setError(`Error fetching test packages: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setLoading(false);
      }
    };
    
    fetchPackages();
  }, []);
  
  // Run a test for a specific package
  const runTest = async (packageId: number) => {
    try {
      setRunningTestId(packageId);
      
      // Get the package info
      const packageInfo = packages.find(p => p.id === packageId);
      if (!packageInfo) {
        throw new Error('Invalid package ID');
      }
      
      // Use client-side test execution since service worker functionality 
      // requires running in the browser
      const result = await testScormProgressIndicator(packageInfo, undefined, networkCondition);
      
      // Add result to results list
      setTestResults(prev => [result, ...prev]);
      
      // Switch to results tab
      setActiveTab('results');
    } catch (error) {
      setError(`Test execution failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunningTestId(null);
    }
  };
  
  // Run all tests in sequence
  const runAllTests = async () => {
    for (const pkg of packages) {
      await runTest(pkg.id);
      // Wait a bit between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };
  
  // Clear test results
  const clearResults = () => {
    setTestResults([]);
  };
  
  // Format file size for display
  const formatSize = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };
  
  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-6">SCORM Progress Indicator Test</h1>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6 flex items-start">
          <AlertCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}
      
      <div className="mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <Button 
            onClick={runAllTests} 
            disabled={loading || runningTestId !== null}
          >
            {runningTestId !== null && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Run All Tests
          </Button>
          
          <Button 
            variant="outline" 
            onClick={clearResults}
            disabled={testResults.length === 0}
          >
            Clear Results
          </Button>
          
          <div className="flex items-center space-x-2 ml-auto">
            <span className="text-sm font-medium">Network:</span>
            <select 
              value={networkCondition}
              onChange={(e) => setNetworkCondition(e.target.value as any)}
              className="border rounded px-2 py-1 text-sm"
              disabled={runningTestId !== null}
            >
              <option value="fast">Fast</option>
              <option value="normal">Normal</option>
              <option value="slow">Slow</option>
            </select>
          </div>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="packages">Test Packages</TabsTrigger>
          <TabsTrigger value="results" disabled={testResults.length === 0}>
            Test Results ({testResults.length})
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="packages">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-2">Loading test packages...</span>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {packages.map(pkg => (
                <Card key={pkg.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <CardTitle>{pkg.name}</CardTitle>
                    <CardDescription>SCORM {pkg.type.split('_')[1]}</CardDescription>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center">
                        <Package className="w-4 h-4 mr-2 text-gray-500" />
                        Size:
                      </div>
                      <div>{formatSize(pkg.size)}</div>
                      
                      <div className="flex items-center">
                        <FileText className="w-4 h-4 mr-2 text-gray-500" />
                        Files:
                      </div>
                      <div>{pkg.fileCount}</div>
                      
                      <div className="flex items-center">
                        <Clock className="w-4 h-4 mr-2 text-gray-500" />
                        Expected Time:
                      </div>
                      <div>{(pkg.expectedExtractionTime || 0) / 1000}s</div>
                    </div>
                  </CardContent>
                  
                  <CardFooter className="pt-0">
                    <Button 
                      onClick={() => runTest(pkg.id)}
                      disabled={runningTestId !== null}
                      className="w-full"
                      variant={runningTestId === pkg.id ? "outline" : "default"}
                    >
                      {runningTestId === pkg.id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Running Test...
                        </>
                      ) : (
                        <>
                          <Server className="w-4 h-4 mr-2" />
                          Run Test
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="results">
          <div className="space-y-6">
            {testResults.length === 0 ? (
              <div className="text-center p-8 border rounded bg-gray-50">
                <p className="text-gray-500">No test results yet. Run some tests to see results here.</p>
              </div>
            ) : (
              testResults.map((result, index) => (
                <Card key={index}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle>{result.packageName}</CardTitle>
                      <div className={`flex items-center px-3 py-1 rounded-full text-sm ${result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {result.success ? (
                          <>
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Success
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4 mr-1" />
                            Failed
                          </>
                        )}
                      </div>
                    </div>
                    <CardDescription>
                      Test duration: {(result.duration / 1000).toFixed(2)}s | 
                      Updates: {result.progressUpdatesReceived}
                    </CardDescription>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="space-y-4">
                      {/* Progress Stage Visualization */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">Stage Progression</h4>
                        <div className="flex items-center w-full">
                          {result.stageProgression.map((stage, i) => (
                            <div key={i} className="flex-1 relative">
                              <div className={`h-2 ${getStageColor(stage)}`} />
                              <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-[10px] whitespace-nowrap">
                                {stage}
                              </div>
                              {i < result.stageProgression.length - 1 && (
                                <div className="absolute top-0 right-0 transform translate-x-1/2 w-4 h-4 bg-white rounded-full border-2 border-blue-600 z-10" />
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="h-6" /> {/* Spacer for labels */}
                      </div>
                      
                      {/* Progress Chart */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">Progress Updates</h4>
                        <div className="h-32 bg-gray-100 relative rounded-md overflow-hidden">
                          {result.progressEvents.map((event, index) => {
                            const left = (index / result.progressEvents.length * 100);
                            const height = (event.progress * 100);
                            return (
                              <div 
                                key={index}
                                className={`absolute bottom-0 w-1 ${getStageColor(event.stage)}`}
                                style={{ 
                                  left: `${left}%`, 
                                  height: `${height}%`,
                                  minHeight: '1px'
                                }}
                                title={`${event.stage || 'unknown'}: ${Math.round(event.progress * 100)}%`}
                              />
                            );
                          })}
                        </div>
                        <div className="flex justify-between text-xs mt-1 text-gray-500">
                          <div>Start ({new Date(result.startTime).toLocaleTimeString()})</div>
                          <div>End ({new Date(result.endTime).toLocaleTimeString()})</div>
                        </div>
                      </div>
                      
                      {/* Statistics */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">Test Statistics</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500">Average Time Between Updates</p>
                            <p className="font-medium">{Math.round(result.avgTimeBetweenUpdates)}ms</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Max Time Between Updates</p>
                            <p className="font-medium">{result.maxTimeBetweenUpdates}ms</p>
                          </div>
                          <div>
                            <p className="text-gray-500">File Count Consistent</p>
                            <p className="font-medium">{result.consistentFileCount ? 'Yes' : 'No'}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Missing Stages</p>
                            <p className="font-medium">
                              {result.missingStages.length === 0 ? 
                                'None' : 
                                result.missingStages.join(', ')}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Error Information */}
                      {result.error && (
                        <div className="bg-red-50 border border-red-200 rounded p-3">
                          <h4 className="text-sm font-medium text-red-800 mb-1">Error</h4>
                          <p className="text-sm text-red-700">{result.error}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Helper function to get color based on stage
function getStageColor(stage?: string): string {
  if (!stage) return 'bg-gray-300';
  
  const stageKey = stage.toLowerCase();
  
  if (stageKey.includes('download')) return 'bg-sky-500';
  if (stageKey.includes('process')) return 'bg-indigo-600';
  if (stageKey.includes('extract')) return 'bg-blue-600';
  if (stageKey.includes('complete')) return 'bg-green-500';
  
  return 'bg-gray-300';
} 