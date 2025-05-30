"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScormMetadata } from "@/components/scorm-upload";
import { ClientScormUpload } from "@/components/client-wrappers";

export const ScormUploadPreview = () => {
  const [scormUrl, setScormUrl] = useState<string | undefined>(undefined);
  const [scormData, setScormData] = useState<ScormMetadata | null>(null);

  return (
    <div className="max-w-xl mx-auto my-8 p-4">
      <Card>
        <CardHeader>
          <CardTitle>SCORM Package Upload</CardTitle>
          <CardDescription>
            Upload a SCORM package (.zip) to preview and validate it
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientScormUpload 
            onChange={setScormUrl} 
            onScormData={setScormData} 
          />

          {scormData && (
            <div className="mt-6 p-4 border border-slate-200 rounded-md">
              <h3 className="text-lg font-medium mb-2">SCORM Package Details</h3>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">Title:</span> {scormData.title}</p>
                {scormData.description && (
                  <p><span className="font-medium">Description:</span> {scormData.description}</p>
                )}
                <p><span className="font-medium">Version:</span> {scormData.version}</p>
                <p><span className="font-medium">Entry Point:</span> {scormData.entryPoint}</p>
                <p><span className="font-medium">Manifest Path:</span> {scormData.manifestPath}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}; 