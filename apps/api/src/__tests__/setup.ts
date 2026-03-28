// Vitest global setup for API tests
// Set the minimum required env vars so modules can be imported without crashing

process.env['ANTHROPIC_API_KEY'] = process.env['ANTHROPIC_API_KEY'] ?? 'sk-ant-test-key-for-tests'
process.env['DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'postgresql://axis:axis@localhost:5432/axis_test'
process.env['REDIS_URL'] = process.env['REDIS_URL'] ?? 'redis://localhost:6379'
process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'test-jwt-secret-at-least-32-chars-long'
process.env['ENCRYPTION_KEY'] = process.env['ENCRYPTION_KEY'] ?? 'a'.repeat(64)
process.env['NODE_ENV'] = 'test'
