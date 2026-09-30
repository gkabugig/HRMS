import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB; disciplinary attachments (scanned letters, signed
      // responses) need more room.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
