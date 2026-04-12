/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent webpack from bundling server-only packages that use Node.js built-ins
  // This is the correct key for Next.js 15
  serverExternalPackages: ['firebase-admin', '@google/genai'],
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, x-sensor-secret' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
