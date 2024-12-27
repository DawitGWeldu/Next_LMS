import { DashboardConfig } from "@/types"

export const dashboardConfig: DashboardConfig = {
  mainNav: [
    {
      title: "Home",
      href: "/",
    },
    // {
    //   title: "Support",
    //   href: "/support",
    //   disabled: true,
    // },
  ],
  sidebarNav: [
    {
      title: "Browse",
      href: "/search",
      icon: "post",
    },
    {
      title: "Dashboard",
      href: "/dashboard",
      icon: "billing",
    },
    {
      title: "My Courses",
      href: "/teacher/courses",
      icon: "laptop",
    },
    {
      title: "Settings",
      href: "/settings",
      icon: "settings",
    },
  ],
}
