/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@axis/types'],

  ...(process.env.DOCKER_BUILD === 'true' ? { output: 'standalone' } : {}),

  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
