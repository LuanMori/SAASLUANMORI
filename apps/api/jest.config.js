// apps/api/jest.config.js
// Jest em modo ESM (NestJS 12 é ESM). Rodar via `npm test` (passa --experimental-vm-modules).
// Os testes usam Postgres de verdade: cada execução recria o banco saas_teste.
export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.json' }],
  },
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  globalSetup: '<rootDir>/test/apoio/global-setup.js',
  setupFiles: ['<rootDir>/test/apoio/ambiente.ts'],
  testTimeout: 60000,
  maxWorkers: 1,
};
