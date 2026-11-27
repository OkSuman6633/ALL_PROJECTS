const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
    output: 'standalone',
    outputFileTracingRoot: path.join(__dirname),
};

module.exports = nextConfig;
