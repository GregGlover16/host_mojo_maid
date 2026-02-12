// Global test setup — runs before all test files.
// Sets NODE_ENV to test so env validation picks it up.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';
process.env.LOG_LEVEL = 'silent';
