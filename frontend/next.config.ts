import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.cache = false  // reduces memory usage during build
    return config
  },
};

export default nextConfig;
