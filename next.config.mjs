import path from 'path';
import { fileURLToPath } from 'url';
import createMDX from '@next/mdx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  // Include content directory for MDX processing
  transpilePackages: [],
  // Turbopack configuration (Next.js 16 default)
  turbopack: {},
  // Webpack configuration
  webpack: (config, { isServer }) => {
    // Ensure content directory is included in MDX processing
    const contentDir = path.resolve(__dirname, 'content');
    config.module.rules.forEach((rule) => {
      if (rule.oneOf) {
        rule.oneOf.forEach((oneOfRule) => {
          if (oneOfRule.test?.toString().includes('mdx')) {
            if (oneOfRule.include) {
              if (Array.isArray(oneOfRule.include)) {
                oneOfRule.include.push(contentDir);
              } else {
                oneOfRule.include = [oneOfRule.include, contentDir];
              }
            }
          }
        });
      }
    });

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
