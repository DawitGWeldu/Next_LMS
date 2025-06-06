import * as React from "react"

import { siteConfig } from "@/config/site"
import { cn } from "@/lib/utils"
import { Icons } from "@/components/icons"
import { ModeToggle } from "@/components/mode-toggle"

export function SiteFooter({ className }: React.HTMLAttributes<HTMLElement>) {
  return (
    <footer className={cn(className)}>
      <div className="container flex flex-col items-center justify-between gap-4 py-10 md:h-24 md:flex-row md:py-0">
        <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
          <Icons.logo />
          <p className="text-center text-sm leading-loose md:text-left">
            Built by{" "}
            <a
              href={siteConfig.links.twitter}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              Dawit Getachew
            </a>
            . &copy;{" "}
            <span
              className="font-medium underline-offset-4"
            >
              2024
            </span>
            . Follow me on {" "}
            <a
              href="https://www.linkedin.com/in/dawit-g-woldu/"
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              LinkedIn
            </a>
            {" "} and checkout my {" "}
            <a
              href={siteConfig.links.github}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              Github
            </a>
             {" "}Profile.
          </p>
        </div>
      </div>
    </footer>
  )
}
