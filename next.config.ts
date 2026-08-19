import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse / mammoth are CommonJS + filesystem-touching; keep them external
  // so Next does not try to bundle their optional test fixtures.
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

export default nextConfig;
