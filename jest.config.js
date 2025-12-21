module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    transform: {
        '^.+\\.ts?$': 'ts-jest',
    },
    moduleFileExtensions: ['ts', 'js', 'json', 'node'],
    testMatch: ['**/*.test.ts'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    modulePathIgnorePatterns: ['<rootDir>/dist/'],
    setupFilesAfterEnv: ['@testing-library/jest-dom'],
    collectCoverage: true,
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/*.test.ts',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
    coverageThreshold: {
        global: {
            branches: 80,
            functions: 85,
            lines: 90,
            statements: 90,
        },
        'src/subjects/**/*.ts': {
            branches: 100,
            functions: 100,
            lines: 100,
            statements: 100,
        },
        'src/utils/**/*.ts': {
            branches: 100,
            functions: 100,
            lines: 100,
            statements: 100,
        },
        'src/eventNotifier/**/*.ts': {
            branches: 100,
            functions: 100,
            lines: 100,
            statements: 100,
        },
    },
};
