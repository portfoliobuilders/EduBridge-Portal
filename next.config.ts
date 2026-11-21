import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/students',
        destination: '/candidates',
        permanent: true,
      },
      {
        source: '/students/:path*',
        destination: '/candidates/:path*',
        permanent: true,
      },
    ]
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
