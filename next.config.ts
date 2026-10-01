import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow a 3 MB photo plus multipart form fields and request overhead.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
