/** @type {import('next').NextConfig} */
import NodePolyfillPlugin from 'node-polyfill-webpack-plugin';

const nextConfig = {
    images: {
        domains:[
            "utfs.io",
        ]
    },
    webpack: (config, { isServer }) => {
      if (!isServer) {
        // Prevent Webpack from trying to bundle `child_process` in the browser
        config.resolve.fallback = {
          ...config.resolve.fallback,
          child_process: false,
        };
      }
  
      config.plugins.push(new NodePolyfillPlugin());
  
      return config;
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    poweredByHeader: false,
    async headers() {
        return [
          {
            source: "/api/:path*",
            headers: [
              {
                key: "Access-Control-Allow-Origin",
                value: "*", // Set your origin
              },
              {
                key: "Access-Control-Allow-Methods",
                value: "GET, POST, PUT, DELETE, OPTIONS",
              },
              {
                key: "Access-Control-Allow-Headers",
                value: "Content-Type, Authorization",
              },
            ],
          },
          {
            // Add headers for SCORM content
            source: "/scorm-content/:path*",
            headers: [
              {
                key: "Access-Control-Allow-Origin",
                value: "*",
              },
              {
                key: "Access-Control-Allow-Methods",
                value: "GET",
              },
              {
                key: "Cross-Origin-Resource-Policy",
                value: "cross-origin",
              },
              {
                key: "Cross-Origin-Embedder-Policy",
                value: "credentialless",
              }
            ],
          }
        ];
      },
};

export default nextConfig;
