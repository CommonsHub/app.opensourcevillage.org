const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFiles: ['<rootDir>/jest.polyfills.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Map @opencollective/token-factory to linked package
    '^@opencollective/token-factory$': '/Users/xdamman/github/opencollective/token-factory/dist/index.js',
    // Map @wevm/viem to viem (token-factory uses Deno import maps)
    '^@wevm/viem$': 'viem',
    '^@wevm/viem/(.*)$': 'viem/$1',
    // Map Deno std library to Node.js equivalents
    '^@std/path$': 'path',
    '^@std/fs$': 'fs',
  },
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/__tests__/**',
  ],
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
    '**/tests/**/*.[jt]s?(x)',
  ],
  // Transform ESM packages - include nostr-tools and its dependencies
  transformIgnorePatterns: [
    '/node_modules/(?!(@opencollective/token-factory|viem|@wevm|@safe-global|nostr-tools|@noble)/)',
  ],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
