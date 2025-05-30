"use client";

import { useState } from 'react';
import { ScormPreview } from './ScormPreview';
import { ScormVersion } from '@/lib/client/scorm-api';

interface ScormPreviewExampleProps {
  courseId: string;
  packageUrl: string;
  scormVersion?: ScormVersion;
}

export function ScormPreviewExample({ 
  courseId, 
  packageUrl,
  scormVersion = ScormVersion.SCORM_12
}: ScormPreviewExampleProps) {
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // The URL to send SCORM data to the server
  const lmsCommitUrl = `/api/courses/${courseId}/scorm-package/tracking`;
  
  // Handle SCORM data changes
  const handleDataChange = (key: string, value: any) => {
    console.log(`SCORM data changed: ${key} = ${value}`);
    // In a real application, you might want to send this to the server
    // or update some local state
  };
  
  // Handle progress updates during extraction
  const handleProgress = (progress: number) => {
    setProgress(progress);
  };
  
  // Handle errors
  const handleError = (error: Error) => {
    console.error('ScormPreviewExample error:', error);
    setError(error.message);
  };
  
  // Handle successful load
  const handleLoad = () => {
    console.log('SCORM content loaded successfully');
    setIsLoaded(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Optional status display */}
      <div className="p-4 bg-white border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div 
              className={`w-3 h-3 rounded-full ${isLoaded ? 'bg-green-500' : 'bg-amber-500'}`}
            />
            <span className="text-sm font-medium">
              {isLoaded ? 'Content Loaded' : 'Loading Content...'}
            </span>
          </div>
          
          {error && (
            <div className="text-sm text-red-500">
              Error: {error}
            </div>
          )}
          
          {!isLoaded && progress > 0 && (
            <div className="text-sm text-slate-500">
              Extracting: {Math.round(progress)}%
            </div>
          )}
        </div>
      </div>
      
      {/* SCORM Preview component */}
      <div className="flex-1">
        <ScormPreview
          packageUrl={packageUrl}
          scormVersion={scormVersion}
          packageKey={`scorm-${courseId}`}
          lmsCommitUrl={lmsCommitUrl}
          onDataChange={handleDataChange}
          onProgress={handleProgress}
          onError={handleError}
          onLoad={handleLoad}
          autoCommitSeconds={30}
        />
      </div>
    </div>
  );
} 