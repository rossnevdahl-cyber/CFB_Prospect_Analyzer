import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // grading.yaml and the birthdate overrides are read at runtime; ship them with every function.
  outputFileTracingIncludes: {
    "/**": ["./config/**", "./data/overrides/**"],
  },
  serverExternalPackages: ["pg"],
};

export default nextConfig;
