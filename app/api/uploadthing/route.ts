import { createRouteHandler } from "uploadthing/next";
 
import { ourFileRouter } from "./core";
 
// Export routes for Next App Router
export const { GET, POST } = createRouteHandler({
  router: ourFileRouter,
});

// This is a dummy export to satisfy Next.js build process
// See: https://github.com/vercel/next.js/discussions/48724
export const dynamic = "force-dynamic";
