import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const rbacModule = path.join(rootDir, 'lib/rbac.ts')

/** @type {import('next').NextConfig} */

const nextConfig = {
  output: 'standalone',

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },

  turbopack: {
    resolveAlias: {
      '@/lib/rbac': './lib/rbac.ts',
    },
  },

  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@/lib/rbac$': rbacModule,
    }
    return config
  },
}

export default nextConfig