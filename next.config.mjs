import path from 'path';
import { fileURLToPath } from 'url';
import createMDX from '@next/mdx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the actual path to token-factory
const tokenFactoryDist = path.resolve(__dirname, '../../opencollective/token-factory/dist');

// MDX configuration
const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable MDX pages
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  // Turbopack configuration (Next.js 16 default)
  turbopack: {},
  // Webpack configuration
  webpack: (config, { isServer }) => {
    console.log('Webpack config - setting alias for @opencollective/token-factory to:', tokenFactoryDist);
    config.resolve.alias['@opencollective/token-factory'] = tokenFactoryDist;

    // Fix for ws package native bindings in server-side code
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        bufferutil: 'bufferutil',
        'utf-8-validate': 'utf-8-validate',
      });
    }

    return config;
  },
};

export default withMDX(nextConfig);
