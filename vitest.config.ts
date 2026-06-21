import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Emit a JUnit report in CI for Codecov Test Analytics; keep local runs quiet.
    reporters: process.env.CI
      ? ['default', ['junit', { outputFile: './coverage/junit.xml' }]]
      : ['default'],
    coverage: {
      provider: 'v8',
      // lcov for Codecov upload, text for the local/CI console summary.
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      // Measure the shipped source only; tests and the bundled output are noise.
      include: ['src/**/*.ts'],
    },
  },
});
