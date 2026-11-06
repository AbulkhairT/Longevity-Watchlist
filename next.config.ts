import type { NextConfig } from "next";

// Static export only: the site has no runtime server. Research collection and
// AI drafting run in GitHub Actions, never on visitor requests.
const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;
