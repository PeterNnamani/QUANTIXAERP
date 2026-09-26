import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */

const nextConfig = {
  output: 'standalone',

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },

  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // Keep the app on lib/rbac.ts. A sibling .mjs/.js file is resolved first
      // and previously shipped without explicitAccessLevels / hasExplicitMenuGrant,
      // which crashed login as soon as access_levels were remapped.
      '@/lib/rbac$': path.join(rootDir, 'lib/rbac.ts'),
    }
    return config
  },
}

export default nextConfig
