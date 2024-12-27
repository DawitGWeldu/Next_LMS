"use client"

import { BarChart, Compass, Layout, List } from "lucide-react"
import { SidebarItem } from "./sidebar-item";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

const guestRoutes = [
    {
        icon: Layout,
        label: "Dashboard",
        href: "/dashboard"
    },
    {
        icon: Compass,
        label: "Browse",
        href: "/search"
    },
    {
        icon: List,
        label: "My Courses",
        href: "/teacher/courses"
    },
]

const teacherRoutes = [
    {
        icon: List,
        label: "Courses",
        href: "/teacher/courses"
    },
    {
        icon: BarChart,
        label: "Analytics",
        href: "/teacher/analytics"
    }
]

export const SidebarRoutes = () => {
    const pathname = usePathname();
    const { data: session } = useSession();

    const isTeacherPage = pathname?.includes("/teacher");
    
    const routes = session?.user.role == "TEACHER" ? teacherRoutes : guestRoutes;
    return (
        <div className="flex flex-col w-full">
            {routes.map((route) => (
                <SidebarItem
                    key={route.href}
                    icon={route.icon}
                    label={route.label}
                    href={route.href}
                />
            ))}
        </div>
    )
}