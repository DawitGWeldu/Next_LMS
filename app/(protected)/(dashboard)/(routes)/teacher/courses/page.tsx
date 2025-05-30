import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";

import { DataTable } from "./_components/data-table";
import { columns } from "./_components/columns";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusCircle, UploadCloud } from "lucide-react";

const CoursesPage = async () => {
  const user = await currentUser();

  if (!user?.id) {
    return redirect("/");
  }

  const courses = await db.course.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      scormPackage: true,
    }
  });

  return ( 
    <div className="p-6">
      <div className="flex justify-end mb-4 gap-x-2">
        <Link href="/teacher/import-scorm">
          <Button>
            <UploadCloud className="h-4 w-4 mr-2" />
            Import SCORM Package
          </Button>
        </Link>
        <Link href="/teacher/create">
          <Button>
            <PlusCircle className="h-4 w-4 mr-2" />
            New course
          </Button>
        </Link>
      </div>
      <DataTable columns={columns} data={courses} />
    </div>
   );
}
 
export default CoursesPage;