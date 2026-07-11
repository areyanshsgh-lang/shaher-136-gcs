import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    // The app is type-clean; let type errors fail the build instead of shipping.
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
