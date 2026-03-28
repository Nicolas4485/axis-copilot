import type { NextConfig } from 'next'

const isDocker = process.env['DOCKER_BUILD'] === 'true'

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployments
  ...(isDocker ? { output: 'standalone' as const } : {}),

  // Proxy API calls to the backend in production
  async rewrites() {
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000'
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
