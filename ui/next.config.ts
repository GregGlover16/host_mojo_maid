import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy API requests to the Fastify backend during development
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3000/:path*",
      },
    ];
  },
};

export default nextConfig;
