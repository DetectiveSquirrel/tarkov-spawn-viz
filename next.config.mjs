/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
// Set this env var when deploying to GitHub Pages, e.g. '/tarkov-spawn-viz'
const basePath = '/tarkov-spawn-viz';

const nextConfig = {
  output: 'export',
  basePath: basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  images: { unoptimized: true },
};

export default nextConfig;


