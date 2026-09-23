/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/__/auth/:path*',
        destination: 'https://finance-portfolio-310cf.firebaseapp.com/__/auth/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
