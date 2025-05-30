"use client";

import * as z from "zod";
import axios from "axios";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Pencil, FileArchive, Info, ExternalLink } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ScormVersion } from "@prisma/client";

interface ScormDetailsFormProps {
    initialData: {
        scormPackage: {
            id: string;
            title: string;
            description?: string | null;
            version: ScormVersion;
            entryPoint: string;
            manifestPath: string;
            extractedPath?: string | null;
            originalZipUrl: string;
            createdAt: string;
            updatedAt: string;
        } | null;
    };
    courseId: string;
};

const formSchema = z.object({
    title: z.string().min(1, {
        message: "Title is required",
    }),
    description: z.string().optional(),
});

export const ScormDetailsForm = ({
    initialData,
    courseId
}: ScormDetailsFormProps) => {
    const [isEditing, setIsEditing] = useState(false);

    const toggleEdit = () => setIsEditing((current) => !current);

    const router = useRouter();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: initialData.scormPackage?.title || "",
            description: initialData.scormPackage?.description || "",
        },
    });

    const { isSubmitting, isValid } = form.formState;

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        try {
            await axios.patch(`/api/courses/${courseId}/scorm-package`, values);
            toast.success("SCORM package updated");
            toggleEdit();
            router.refresh();
        } catch {
            toast.error("Something went wrong");
        }
    }

    if (!initialData.scormPackage) {
        return (
            <div className="mt-6 border bg-slate-100 rounded-md p-4">
                <div className="font-medium flex items-center">
                    <FileArchive className="h-4 w-4 mr-2" />
                    SCORM Package
                </div>
                <p className="text-sm text-slate-500 mt-2">
                    No SCORM package information available.
                </p>
            </div>
        );
    }

    return (
        <div className="mt-6 border bg-slate-100 rounded-md p-4">
            <div className="font-medium flex items-center justify-between">
                <div className="flex items-center">
                    <FileArchive className="h-4 w-4 mr-2" />
                    SCORM Package
                </div>
                <div className="flex items-center gap-x-2">
                    <Badge variant="outline" className={cn(
                        initialData.scormPackage.version === "SCORM_12" 
                            ? "bg-blue-50 text-blue-700 border-blue-200" 
                            : "bg-green-50 text-green-700 border-green-200"
                    )}>
                        {initialData.scormPackage.version === "SCORM_12" ? "SCORM 1.2" : "SCORM 2004"}
                    </Badge>
                    <Button onClick={toggleEdit} variant="ghost">
                        {isEditing ? (
                            <>Cancel</>
                        ) : (
                            <>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit details
                            </>
                        )}
                    </Button>
                </div>
            </div>
            
            {!isEditing && (
                <div className="mt-4 space-y-4">
                    <div>
                        <h3 className="font-medium text-sm">Title</h3>
                        <p className="text-sm mt-1">
                            {initialData.scormPackage.title}
                        </p>
                    </div>
                    
                    {initialData.scormPackage.description && (
                        <div>
                            <h3 className="font-medium text-sm">Description</h3>
                            <p className="text-sm mt-1">
                                {initialData.scormPackage.description}
                            </p>
                        </div>
                    )}

                    <div className="pt-2 border-t border-slate-200">
                        <h3 className="font-medium text-sm">Technical Details</h3>
                        
                        <div className="grid grid-cols-1 gap-2 mt-2">
                            <div className="grid grid-cols-3 gap-2 text-sm">
                                <span className="text-slate-500">Entry Point:</span>
                                <span className="col-span-2 font-mono text-xs bg-slate-200 p-1 rounded">
                                    {initialData.scormPackage.entryPoint}
                                </span>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-2 text-sm">
                                <span className="text-slate-500">Manifest Path:</span>
                                <span className="col-span-2 font-mono text-xs">
                                    {initialData.scormPackage.manifestPath}
                                </span>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-2 text-sm">
                                <span className="text-slate-500">Original ZIP:</span>
                                <Link 
                                    href={initialData.scormPackage.originalZipUrl}
                                    target="_blank"
                                    className="col-span-2 text-xs text-blue-600 hover:text-blue-800 flex items-center"
                                >
                                    Download <ExternalLink className="h-3 w-3 ml-1" />
                                </Link>
                            </div>
                        </div>
                        
                        <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded-md">
                            <div className="flex text-xs text-blue-700">
                                <Info className="h-3.5 w-3.5 mr-1 flex-shrink-0 mt-0.5" />
                                <p>
                                    This SCORM package was imported on {new Date(initialData.scormPackage.createdAt).toLocaleDateString()}.
                                    SCORM packages are self-contained learning modules with their own internal structure and content.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {isEditing && (
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="space-y-4 mt-4"
                    >
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <Input
                                            disabled={isSubmitting}
                                            placeholder="e.g. 'Introduction to SCORM'"
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
                                <FormItem>
                                    <FormControl>
                                        <Textarea
                                            disabled={isSubmitting}
                                            placeholder="Description of the SCORM package"
                                            {...field}
                                            value={field.value || ""}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        
                        <div className="flex items-center gap-x-2">
                            <Button
                                disabled={!isValid || isSubmitting}
                                type="submit"
                            >
                                Save
                            </Button>
                        </div>
                    </form>
                </Form>
            )}
        </div>
    )
} 