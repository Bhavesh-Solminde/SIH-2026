// Point the Prisma client at the test database before any module imports it.
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? "postgresql://solminde@localhost:5433/bhaav_test?schema=public";
process.env.SESSION_SECRET = "test-secret";
process.env.AIML_URL = process.env.AIML_URL ?? "http://127.0.0.1:8000";
