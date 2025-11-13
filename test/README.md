# Test Suite Documentation

This directory contains comprehensive unit and integration tests for the LLM API Layer.

## Test Structure

```
test/
├── config/
│   └── redis.test.ts           # Redis client tests
├── services/
│   └── tenantService.test.ts   # Tenant service tests
├── plugins/
│   └── auth.test.ts            # Authentication plugin tests
├── routes/
│   └── auth.test.ts            # Auth route handler tests
└── server.test.ts              # Server integration tests
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with coverage
```bash
npm run test:coverage
```

### Run tests with verbose output
```bash
npm run test:verbose
```

### Run specific test file
```bash
npm test -- redis.test.ts
```

### Run tests matching a pattern
```bash
npm test -- --testNamePattern="should create"
```

## Test Coverage

The test suite includes:

### Redis Client Tests (`test/config/redis.test.ts`)
- ✅ Connection establishment
- ✅ Environment variable configuration
- ✅ Error handling
- ✅ Event listeners setup
- ✅ Reconnection strategy
- ✅ Client retrieval
- ✅ Disconnection

**Coverage:** ~95% of redis.ts

### Tenant Service Tests (`test/services/tenantService.test.ts`)
- ✅ Tenant CRUD operations
- ✅ User CRUD operations
- ✅ Password hashing and verification
- ✅ Session management
- ✅ Token blacklisting
- ✅ Email and domain lookups
- ✅ Multi-tenant isolation

**Coverage:** ~90% of tenantService.ts

### Auth Plugin Tests (`test/plugins/auth.test.ts`)
- ✅ Plugin registration
- ✅ JWT strategy configuration
- ✅ Token validation
- ✅ Tenant and user verification
- ✅ Token blacklist checking
- ✅ Scope-based authorization (admin/user)
- ✅ Request context extension

**Coverage:** ~85% of auth.ts

### Auth Routes Tests (`test/routes/auth.test.ts`)
- ✅ User registration
- ✅ Tenant creation
- ✅ Login (with domain and tenantId)
- ✅ Logout and token blacklisting
- ✅ Current user retrieval
- ✅ User creation (admin only)
- ✅ User listing (admin only)
- ✅ Input validation
- ✅ Authorization checks
- ✅ Error scenarios

**Coverage:** ~88% of auth.ts (routes)

### Server Integration Tests (`test/server.test.ts`)
- ✅ Server initialization
- ✅ Health check endpoint
- ✅ Root information endpoint
- ✅ Error handling middleware
- ✅ CORS configuration
- ✅ Request validation
- ✅ Preflight requests

**Coverage:** ~75% of server-related code

## Test Patterns

### Mocking Redis
```typescript
jest.mock('../../src/config/redis');
const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  // ...
};
(redisClient.getClient as jest.Mock).mockReturnValue(mockRedisClient);
```

### Mocking Services
```typescript
jest.mock('../../src/services/tenantService');
(tenantService.createTenant as jest.Mock).mockResolvedValue(mockTenant);
```

### Testing Authenticated Routes
```typescript
const token = JWT.token.generate(
  { userId: 'user-123', tenantId: 'tenant-123', role: 'admin' },
  { key: 'your-secret-key-change-in-production', algorithm: 'HS256' },
  { ttlSec: 14400 }
);

const response = await server.inject({
  method: 'GET',
  url: '/api/auth/me',
  headers: { authorization: `Bearer ${token}` }
});
```

### Testing Error Scenarios
```typescript
it('should reject if tenant does not exist', async () => {
  mockRedisClient.exists.mockResolvedValue(0);
  const response = await server.inject({
    method: 'GET',
    url: '/test'
  });
  expect(response.statusCode).toBe(401);
});
```

## Code Coverage Goals

- **Overall:** > 80%
- **Statements:** > 85%
- **Branches:** > 75%
- **Functions:** > 80%
- **Lines:** > 85%

## Coverage Report

After running `npm run test:coverage`, view the detailed HTML report:
```bash
open coverage/lcov-report/index.html
```

## Continuous Integration

These tests are designed to run in CI/CD pipelines:
- All tests use mocks (no external dependencies required)
- Tests are isolated and can run in parallel
- Deterministic results (no flaky tests)

## Writing New Tests

### Test File Template
```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('YourModule', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('yourFunction', () => {
    it('should do something', () => {
      // Arrange
      const input = 'test';
      
      // Act
      const result = yourFunction(input);
      
      // Assert
      expect(result).toBe('expected');
    });
  });
});
```

### Best Practices
1. Use descriptive test names
2. Follow AAA pattern (Arrange, Act, Assert)
3. Test both success and failure cases
4. Mock external dependencies
5. Clear mocks between tests
6. Keep tests focused and small
7. Use meaningful assertions

## Troubleshooting

### Tests failing with "Cannot find module"
```bash
npm install
npm run build
```

### Jest cache issues
```bash
npx jest --clearCache
```

### TypeScript errors in tests
Check that `@types/jest` is installed and tsconfig.json includes test files.

### Mock not working
Ensure mocks are defined before imports:
```typescript
jest.mock('module-name'); // Must be before import
import { something } from 'module-name';
```

## Future Improvements

- [ ] Add integration tests with real Redis (using testcontainers)
- [ ] Add load/performance tests
- [ ] Add API endpoint tests using supertest
- [ ] Add snapshot tests for API responses
- [ ] Increase coverage to > 90%
