"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import axios from "axios";
import toast from "react-hot-toast";
import { UploadCloud, X, Loader2, Wand2, FileArchive, AlertCircle, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ScormMetadata } from "@/components/scorm-upload";
import { ClientScormUploadWithRef, useScormUploader } from "@/components/client-wrappers";
import { ScormVersion } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
  title: z.string().min(1, {
    message: "Title is required",
  }),
  description: z.string().optional(),
  originalZipUrl: z.string().optional(),
  scormVersion: z.nativeEnum(ScormVersion),
  entryPoint: z.string().min(1, { message: "SCORM entry point is required" }),
  manifestPath: z.string().min(1, { message: "SCORM manifest path is required" }),
});

type ScormImportFormValues = z.infer<typeof formSchema>;

const ScormImportPage = () => {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [scormFileUrl, setScormFileUrl] = useState<string | undefined>(
    undefined
  );
  const [previewData, setPreviewData] = useState<ScormMetadata | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validatedFile, setValidatedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const scormUploaderRef = useRef<any>(null);

  const form = useForm<ScormImportFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
    },
    mode: "onChange",
  });

  const { isValid, errors } = form.formState;

  // Debug form validation if needed
  // useEffect(() => {
  //   console.log("Form validation state:", { isValid, errors, values: form.getValues() });
  // }, [isValid, errors, form]);

  const handleScormData = (data: ScormMetadata) => {
    setPreviewData(data);
    setValidationError(null);
    
    // Update form fields with extracted data
    form.setValue("title", data.title, { shouldValidate: true });
    if (data.description) {
      form.setValue("description", data.description, { shouldValidate: true });
    }
    form.setValue("scormVersion", data.version, { shouldValidate: true });
    form.setValue("entryPoint", data.entryPoint, { shouldValidate: true });
    form.setValue("manifestPath", data.manifestPath, { shouldValidate: true });
  };
  
  const handleValidationError = (error: string) => {
    setValidationError(error);
    setPreviewData(null);
    setValidatedFile(null);
    
    // Clear form fields on error
    form.setValue("originalZipUrl", "", { shouldValidate: true });
    form.setValue("scormVersion", undefined as any, { shouldValidate: false });
    form.setValue("entryPoint", "", { shouldValidate: false });
    form.setValue("manifestPath", "", { shouldValidate: false });
  };

  const handleFileValidated = (file: File, metadata: ScormMetadata) => {
    setValidatedFile(file);
  };

  const handleUploadProgress = (progress: number) => {
    setUploadProgress(progress);
  };

  const onSubmit = async (values: ScormImportFormValues) => {
    try {
      setIsSubmitting(true);

      // Create a copy of the values to submit
      const submitValues = {...values};

      // If we have a validated file but no URL yet, we need to upload it first
      if (validatedFile && !scormFileUrl) {
        setIsUploading(true);
        
        try {
          // Use the ref to trigger the upload
          if (scormUploaderRef.current) {
            await scormUploaderRef.current.uploadFile(validatedFile);
            
            // After successful upload, the onChange handler will set scormFileUrl
            // We need to get the updated value to include in our submission
            const url = form.getValues("originalZipUrl");
            
            // Make sure we have a URL after upload
            if (!url) {
              throw new Error("Upload completed but URL is missing");
            }
            
            // Update the submission values with the URL
            submitValues.originalZipUrl = url;
          } else {
            throw new Error("Upload component reference not available");
          }
        } catch (uploadError) {
          console.error("Error uploading SCORM package:", uploadError);
          toast.error("Failed to upload SCORM package. Please try again.");
          setIsSubmitting(false);
          setIsUploading(false);
          return;
        }
        
        setIsUploading(false);
      }

      // Proceed with form submission
      // Make sure the originalZipUrl is included in the values at this point
      if (!submitValues.originalZipUrl) {
        toast.error("SCORM package URL is missing. Please try again.");
        setIsSubmitting(false);
        return;
      }

      const response = await axios.post("/api/courses", submitValues);
      router.push(`/teacher/courses/${response.data.id}`);
      toast.success("SCORM course created successfully");
    } catch (error) {
      console.error("Error creating SCORM course:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Import SCORM Package</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload a SCORM package to create a new course
          </p>
        </div>
        <Link href="/teacher/courses">
          <Button variant="ghost">
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </Link>
      </div>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="p-4 bg-slate-50 rounded-md border">
            <div className="flex items-center gap-x-2 mb-4">
              <FileArchive className="h-5 w-5 text-slate-700" />
              <h2 className="text-lg font-medium">SCORM Package</h2>
            </div>
            
            <FormField
              control={form.control}
              name="originalZipUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center">
                    <UploadCloud className="h-4 w-4 mr-2" />
                    Upload SCORM Package (.zip)
                  </FormLabel>
                  <FormControl>
                    <ClientScormUploadWithRef
                      ref={scormUploaderRef}
                      onChange={(url) => {
                        field.onChange(url);
                        setScormFileUrl(url);
                        if (!url) {
                          setPreviewData(null);
                          setValidationError(null);
                          setValidatedFile(null);
                        }
                      }}
                      onScormData={handleScormData}
                      onValidationError={handleValidationError}
                      onFileValidated={handleFileValidated}
                      onUploadProgress={handleUploadProgress}
                      isDisabled={isSubmitting}
                      deferUpload={true}
                    />
                  </FormControl>
                  <FormDescription>
                    Upload your SCORM package. The system will validate and extract metadata. The file will be uploaded when you submit the form.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Preview section */}
            {previewData && (
              <div className="mt-6 p-4 rounded-md bg-white border">
                <div className="flex items-center gap-x-2 mb-3">
                  <Info className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">SCORM Package Details</h3>
                  <Badge variant="outline" className={cn(
                    "ml-auto",
                    previewData.version === "SCORM_12" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-green-50 text-green-700 border-green-200"
                  )}>
                    {previewData.version === "SCORM_12" ? "SCORM 1.2" : "SCORM 2004"}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div className="grid grid-cols-3 gap-2 py-2 border-b border-dashed">
                    <span className="text-muted-foreground">Entry Point:</span>
                    <span className="col-span-2 font-mono text-xs bg-slate-50 p-1 rounded">
                      {previewData.entryPoint}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 py-2 border-b border-dashed">
                    <span className="text-muted-foreground">Manifest Path:</span>
                    <span className="col-span-2 font-mono text-xs">
                      {previewData.manifestPath}
                    </span>
                  </div>
                  
                  <div className="mt-2 text-xs text-muted-foreground">
                    <p className="flex items-center">
                      <Info className="h-3.5 w-3.5 mr-1 text-blue-500" />
                      You can customize the course details below before creating the course.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Validation error display */}
            {validationError && (
              <div className="mt-4 p-3 bg-red-50 rounded-md border border-red-200 text-red-700 text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Invalid SCORM Package</p>
                  <p className="text-xs mt-1">{validationError}</p>
                </div>
              </div>
            )}
          </div>

          <div className={cn(
            "p-4 bg-slate-50 rounded-md border transition-opacity duration-200",
            (!previewData && !scormFileUrl) ? "opacity-50" : "opacity-100"
          )}>
            <div className="flex items-center gap-x-2 mb-4">
              <Wand2 className="h-5 w-5 text-slate-700" />
              <h2 className="text-lg font-medium">Course Details</h2>
            </div>
            
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Course Title</FormLabel>
                  <FormControl>
                    <Input
                      disabled={isSubmitting}
                      placeholder="e.g., 'Introduction to SCORM'"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="mt-4">
                  <FormLabel>Course Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      disabled={isSubmitting}
                      placeholder="Provide a brief description of the course content."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Hidden fields for SCORM metadata, populated by ScormUpload */}
          <FormField name="scormVersion" control={form.control} render={() => <Input type="hidden" />} />
          <FormField name="entryPoint" control={form.control} render={() => <Input type="hidden" />} />
          <FormField name="manifestPath" control={form.control} render={() => <Input type="hidden" />} />
          
          <div className="flex flex-col space-y-4">
            {/* Upload progress display */}
            {isUploading && (
              <div className="w-full space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">Uploading SCORM package...</span>
                  <span className="text-slate-700 font-medium">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}
            
            <div className="flex items-center gap-x-2">
              <Button 
                type="submit" 
                size="lg"
                disabled={
                  !isValid || 
                  isSubmitting || 
                  (!scormFileUrl && !validatedFile) || 
                  (!form.getValues("title"))
                }
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {isUploading ? "Uploading..." : "Creating Course..."}
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Create SCORM Course
                  </>
                )}
              </Button>
              
              {!validatedFile && !scormFileUrl ? (
                <p className="text-xs text-amber-600">
                  <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                  Please upload a valid SCORM package to continue
                </p>
              ) : !form.getValues("title") ? (
                <p className="text-xs text-amber-600">
                  <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                  Please enter a course title to continue
                </p>
              ) : null}
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
};

export default ScormImportPage; 