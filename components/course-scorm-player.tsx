"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { ScormVersion } from "@prisma/client";
import { toast } from "react-hot-toast";
import { 
  Menu, 
  X, 
  Maximize2, 
  Minimize2, 
  BarChart3, 
  Info,
  ChevronLeft
} from "lucide-react";

import { ScormPreview } from "@/components/scorm/ScormPreview";
import {
  ScormContentProvider,
  useScormContent,
} from "@/components/providers/scorm-content-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ExtractedScormPackage } from "@/lib/client/scorm-extractor";

interface CourseScormPlayerProps {
  userId: string;
  courseId: string;
  scormPackageId: string;
  scormUrl: string;
  scormVersion: ScormVersion;
}

// Main component
const CourseScormPlayerContent = ({
  userId,
  courseId,
  scormPackageId,
  scormUrl,
  scormVersion,
}: CourseScormPlayerProps) => {
  // State for UI
  const [showSidebar, setShowSidebar] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  
  // State for learning data
  const [progress, setProgress] = useState({
    status: "incomplete",
    score: 0,
    completion: 0,
  });
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  
  // State for extracted package
  const [extractedPackage, setExtractedPackage] = useState<ExtractedScormPackage | null>(null);
  const [error, setError] = useState<Error | null>(null);
  
  // Access the shared SCORM content
  const { 
    error: contextError,
    scormPackage,
    mainScormUrl,
  } = useScormContent();

  // Track SCORM progress with the server
  const handleDataChange = useCallback(
    async (key: string, value: any) => {
    try {
      console.log(`SCORM data changed: ${key} = ${value}`);
      
      // Determine completion status based on SCORM data
        let completionStatus: string | undefined = undefined;
        let score: number | undefined = undefined;
        let location: string | undefined = undefined;
      
      // Process SCORM data based on key
        if (
          key === "cmi.core.lesson_status" ||
          key === "cmi.completion_status"
        ) {
        completionStatus = value.toUpperCase();

          // Update local progress state
          setProgress(prev => ({
            ...prev,
            status: value.toLowerCase(),
            completion: value.toLowerCase() === "completed" || value.toLowerCase() === "passed" ? 100 : prev.completion
          }));
        
        // Show success message when content is completed
          if (
            completionStatus === "COMPLETED" ||
            completionStatus === "PASSED"
          ) {
          toast.success("Progress saved successfully!");
        }
      }

        // Update progress state based on completion indicators
        if (key === "cmi.progress_measure" || key === "cmi.core.progress_measure") {
          const progressValue = parseFloat(value);
          if (!isNaN(progressValue)) {
            setProgress(prev => ({
              ...prev,
              completion: Math.round(progressValue * 100)
            }));
        }
      }
      
      // Extract location data
        if (key === "cmi.core.lesson_location" || key === "cmi.location") {
        location = value;
      }
      
      // Extract score data
        if (key === "cmi.core.score.raw" || key === "cmi.score.raw") {
          const parsedScore = parseFloat(value);
          score = isNaN(parsedScore) ? 0 : parsedScore;
          // Use a definite score value to satisfy TypeScript
          const definiteScore: number = score;
          setProgress(prev => ({
            ...prev,
            score: definiteScore
          }));
        } else if (key === "cmi.score.scaled") {
          const scaledScore = parseFloat(value);
          if (!isNaN(scaledScore)) {
            setProgress(prev => ({
              ...prev,
              score: Math.round(scaledScore * 100)
            }));
          }
      }
      
      // Collect the full SCORM data
      await axios.post(`/api/courses/${courseId}/scorm-package/tracking`, {
        scormPackageId,
        data: JSON.stringify({ [key]: value }),
        completionStatus,
        location,
          score,
      });
    } catch (error) {
      console.error("Failed to save SCORM tracking data:", error);
      toast.error("Failed to save progress");
    }
    },
    [courseId, scormPackageId]
  );

  // Toggle sidebar for all screen sizes
  const toggleSidebar = useCallback(() => {
    setShowSidebar((prevState) => !prevState);
  }, []);
  
  // Handle errors during SCORM loading
  const handleError = useCallback((error: Error) => {
    console.error("SCORM loading error:", error);
    setError(error);
    toast.error("Failed to load SCORM content");
  }, []);
  
  // Handle successful loading of SCORM content
  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);
  
  // Handle loading progress updates
  const handleProgress = useCallback((progress: number) => {
    setLoadingProgress(progress);
  }, []);
  
  // Handle when package is extracted - save the reference
  const handlePackageExtracted = useCallback((packageData: ExtractedScormPackage) => {
    console.log("SCORM package extracted:", packageData);
    setExtractedPackage(packageData);
  }, []);
  
  // Toggle fullscreen mode
  const toggleFullscreen = useCallback(() => {
    if (!iframeContainerRef.current) return;
    
    if (!isFullscreen) {
      if (iframeContainerRef.current.requestFullscreen) {
        iframeContainerRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }, [isFullscreen]);
  
  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Get title from SCORM package metadata
  const getTitle = () => {
    if (extractedPackage?.manifest?.metadata?.title) {
      return extractedPackage.manifest.metadata.title;
    }
    
    // Try to get title from first organization
    if (extractedPackage?.manifest?.organizations) {
      const orgs = Object.values(extractedPackage.manifest.organizations);
      if (orgs.length > 0) {
        return orgs[0].title;
      }
    }
    
    return "SCORM Content";
  };

  return (
    <div className="flex flex-row h-full overflow-hidden">
      {/* Sidebar */}
      <div 
        className={cn(
          "bg-card border-r flex-shrink-0 h-full transition-all duration-300 overflow-y-auto",
          showSidebar ? "w-80 lg:w-96" : "w-0 border-r-0"
        )}
      >
        <Card className="rounded-none border-0 border-b">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-semibold truncate">{getTitle()}</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                title="Collapse sidebar"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </div>
            {extractedPackage?.manifest?.metadata?.description && (
              <CardDescription className="line-clamp-3 mt-1">
                {extractedPackage.manifest.metadata.description}
              </CardDescription>
            )}
          </CardHeader>
        </Card>
        
        <Tabs defaultValue="progress" className="w-full">
          <TabsList className="w-full justify-start px-4 pt-2">
            <TabsTrigger value="progress" className="flex items-center gap-1">
              <BarChart3 className="h-4 w-4" />
              <span>Progress</span>
            </TabsTrigger>
            <TabsTrigger value="info" className="flex items-center gap-1">
              <Info className="h-4 w-4" />
              <span>Info</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="progress" className="mt-0 p-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Learning Progress</CardTitle>
                <CardDescription>Your current progress in this course</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">Completion</span>
                      <span className="text-sm text-muted-foreground">{progress.completion}%</span>
                    </div>
                    <Progress value={progress.completion} className="h-2" />
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">Score</span>
                      <span className="text-sm text-muted-foreground">{progress.score}%</span>
                    </div>
                    <Progress value={progress.score} className="h-2" />
                  </div>
                  
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-sm font-medium">Status</span>
                    <Badge variant={
                      progress.status === "completed" || progress.status === "passed" 
                        ? "success" 
                        : progress.status === "failed" 
                          ? "destructive" 
                          : "outline"
                    }>
                      {progress.status === "completed" || progress.status === "passed" 
                        ? "Completed" 
                        : progress.status === "failed" 
                          ? "Failed" 
                          : "In Progress"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="info" className="mt-0 p-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Course Information</CardTitle>
                <CardDescription>Details about this SCORM package</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <h4 className="text-sm font-medium">Title</h4>
                  <p className="text-sm text-muted-foreground">{getTitle()}</p>
                </div>
                
                {extractedPackage?.manifest?.metadata?.description && (
                  <div>
                    <h4 className="text-sm font-medium">Description</h4>
                    <p className="text-sm text-muted-foreground">{extractedPackage.manifest.metadata.description}</p>
                  </div>
                )}
                
                <div>
                  <h4 className="text-sm font-medium">SCORM Version</h4>
                  <p className="text-sm text-muted-foreground">{scormVersion}</p>
                </div>
                
                {extractedPackage?.manifest?.metadata?.language && (
                  <div>
                    <h4 className="text-sm font-medium">Language</h4>
                    <p className="text-sm text-muted-foreground">{extractedPackage.manifest.metadata.language}</p>
                  </div>
                )}
                
                {extractedPackage?.manifest?.metadata?.keywords && extractedPackage.manifest.metadata.keywords.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium">Keywords</h4>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {extractedPackage.manifest.metadata.keywords.map((keyword, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Content */}
      <div 
        ref={playerRef}
        className="flex-1 relative h-full overflow-hidden"
      >
        {/* Only show sidebar toggle when sidebar is collapsed */}
        {!showSidebar && (
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={toggleSidebar}
              title="Expand sidebar"
              className="bg-card/80 backdrop-blur-sm shadow-md border-border hover:bg-accent transition-all duration-300"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="absolute top-4 right-4 z-20 flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="bg-card/80 backdrop-blur-sm shadow-md border-border hover:bg-accent transition-all duration-300"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div 
          ref={iframeContainerRef} 
          className="absolute inset-0 w-full h-full bg-muted"
        >
          {error ? (
            <div className="flex h-full items-center justify-center bg-muted p-4">
              <p className="text-center text-sm text-destructive">{error.message}</p>
            </div>
          ) : (
            <ScormPreview 
              packageUrl={scormUrl}
              scormVersion={scormVersion === "SCORM_12" ? "1.2" : ("2004" as any)}
              packageKey={`scorm-${courseId}-${encodeURIComponent(scormUrl)}`}
              lmsCommitUrl={`/api/courses/${courseId}/scorm-package/tracking`}
              lmsGetDataUrl={`/api/courses/${courseId}/scorm-package/tracking`}
              onDataChange={handleDataChange}
              onError={handleError}
              onLoad={handleLoad}
              onProgress={handleProgress}
              onPackageExtracted={handlePackageExtracted}
              autoCommitSeconds={30}
              className="w-full h-full"
            />
          )}
        </div>
        
        {/* Debug panel */}
        {showDebugPanel && (
          <div className="absolute bottom-4 right-4 z-20 w-96 bg-card/90 backdrop-blur-sm border rounded-lg shadow-lg p-3 text-xs font-mono overflow-y-auto max-h-60">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-foreground">Debug Information</h4>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-5 w-5" 
                onClick={() => setShowDebugPanel(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <Separator className="mb-2" />
            <div className="space-y-1 text-foreground">
              <p><span className="text-primary">SCORM Version:</span> {scormVersion}</p>
              <p><span className="text-primary">Content URL:</span> {scormUrl ? `...${scormUrl.substring(scormUrl.length - 30)}` : "None"}</p>
              <p><span className="text-primary">Loading:</span> {isLoading ? "Yes" : "No"}</p>
              <p><span className="text-primary">Progress:</span> {Math.round(loadingProgress * 100)}%</p>
              <p><span className="text-primary">Score:</span> {progress.score}%</p>
              <p><span className="text-primary">Completion:</span> {progress.completion}%</p>
              <p><span className="text-primary">Status:</span> {progress.status}</p>
              <p><span className="text-primary">Package Extracted:</span> {extractedPackage ? "Yes" : "No"}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Main wrapper component that provides the context
export const CourseScormPlayer = ({
  userId,
  courseId,
  scormPackageId,
  scormUrl,
  scormVersion,
}: CourseScormPlayerProps) => {
  // Validate that we have a proper URL
  const [validatedUrl, setValidatedUrl] = useState<string>(scormUrl || "");
  
  useEffect(() => {
    console.log("CourseScormPlayer received scormUrl:", scormUrl);
    // Ensure the URL is not empty
    if (!scormUrl) {
      console.error("CourseScormPlayer: No SCORM URL provided");
    } else {
      setValidatedUrl(scormUrl);
    }
  }, [scormUrl]);

  return (
    <ScormContentProvider courseId={courseId} scormUrl={validatedUrl}>
      <CourseScormPlayerContent 
        userId={userId}
        courseId={courseId}
        scormPackageId={scormPackageId}
        scormUrl={validatedUrl}
        scormVersion={scormVersion}
      />
    </ScormContentProvider>
  );
}; 
