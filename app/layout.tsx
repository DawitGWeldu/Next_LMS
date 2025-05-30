import type { Metadata } from "next";
import { Inter as FontSans } from "next/font/google"
import localFont from "next/font/local"
import "./globals.css";
import { ToastProvider } from "@/components/providers/toaster-provider";
import { ConfettiProvider } from "@/components/providers/confetti-provider";
import { SessionProvider } from 'next-auth/react'
import { auth } from "@/auth";
import { ThemeProvider } from "@/components/theme-provider"
import { TailwindIndicator } from "@/components/tailwind-indicator"
import { cn } from "@/lib/utils"
import { NextSSRPlugin } from "@uploadthing/react/next-ssr-plugin";
import { extractRouterConfig } from "uploadthing/server";
import { ourFileRouter } from "@/app/api/uploadthing/core";



const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
})
const fontHeading = localFont({
  src: "../assets/fonts/CalSans-SemiBold.woff2",
  variable: "--font-heading",
})

export const metadata: Metadata = {
  title: "LMS",
  description: "Made by Dave",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <SessionProvider session={session}>
      <html lang="en">
      {/* pattern-tic-tac-toe-gray-200/10 pattern-tic-tac-toe-scale-100 */}
        <body className={cn(
          "min-h-screen font-sans antialiased",
          fontSans.variable,
          fontHeading.variable
        )}>
          <NextSSRPlugin 
            routerConfig={extractRouterConfig(ourFileRouter)}
          />
          <ConfettiProvider />
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            <ToastProvider />
            {children}
            <TailwindIndicator />
          </ThemeProvider>
        </body>
      </html>
    </SessionProvider>
  );
}
