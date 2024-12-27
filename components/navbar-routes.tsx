"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { UserButton } from "@/components/auth/user-button";

import { LogOut } from "lucide-react";
import { useSession } from "next-auth/react"
import { SearchInput } from "./search-input";
import { useCurrentUser } from "@/hooks/use-current-user";
import { UserAccountNav } from "./user-account-nav";
import { ModeToggle } from "./mode-toggle";

export const NavbarRoutes = () => {
  const user = useCurrentUser();
  const pathname = usePathname();
  const isTeacherPage = pathname?.startsWith("/teacher");
  const isCoursePage = pathname?.includes("/courses");
  const isSearchPage = pathname === "/search";
  const { data: session } = useSession();

  return (
    <>
      {isSearchPage && (
        <div className="hidden md:block">
          <SearchInput />
        </div>
      )}
      <div className="flex gap-x-2 ml-auto">
        {isTeacherPage ? (
          <Link href="/search">
            <Button size="sm" variant="ghost">
              <LogOut className="h-4 w-4 mr-2" />
              Exit
            </Button>
          </Link>
        ) : (session?.user.role == "TEACHER") ? (
          <Link href="/teacher/courses">
            <Button size="sm" variant="ghost">
              Teacher mode
            </Button>
          </Link>
        ) : null}
       
      </div>
    </>
  )
}