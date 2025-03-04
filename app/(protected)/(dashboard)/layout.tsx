import { MainNav } from "@/components/main-nav";
import { Navbar } from "./_components/navbar";
import { Sidebar } from "./_components/sidebar";
import { dashboardConfig } from "@/config/dashboard"
import { SiteFooter } from "@/components/site-footer";
import { UserAccountNav } from "@/components/user-account-nav";
import { DashboardNav } from "@/components/nav";
import { currentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import { ModeToggle } from "@/components/mode-toggle";
const DashboardLayout = async ({
    children
}: {
    children: React.ReactNode
}) => {

    const user = await currentUser();
    if (!user) {
        return notFound();
    }

    return (


        <div className="flex min-h-screen flex-col space-y-6">
            <header className="sticky top-0 z-40 border-b bg-background">
                <div className="container flex h-16 items-center justify-between py-4">
                    <MainNav items={dashboardConfig.mainNav} />
                    <span className="flex items-ceter gap-4 justify-between">
                        <ModeToggle />

                        <UserAccountNav
                            user={{
                                name: user.name,
                                image: user.image,
                                phoneNumber: user.phoneNumber,
                            }}
                        />
                    </span>
                </div>
            </header>
            <div className="container grid flex-1 gap-12 md:grid-cols-[200px_1fr]">
                <aside className="hidden w-[200px] flex-col md:flex">
                    <DashboardNav items={dashboardConfig.sidebarNav} />
                </aside>
                <main className="flex w-full flex-1 flex-col overflow-hidden">
                    {children}
                </main>
            </div>
            <SiteFooter className="border-t" />
        </div>

    );
}

export default DashboardLayout;