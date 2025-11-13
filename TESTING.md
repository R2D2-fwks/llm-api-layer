# Test Execution Guide

## Quick Start

```bash
# Install dependencies (if not already installed)
npm install

# Run all tests
npm test
```

## Available Test Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests once |
| `npm run test:watch` | Run tests in watch mode (re-runs on file changes) |
| `npm run test:coverage` | Run tests and generate coverage report |
| `npm run test:verbose` | Run tests with detailed output |

## Test Files Overview

### 1. Redis Client Tests
**File:** `test/config/redis.test.ts`
**Tests:** 13 test cases

- Connection establishment with default URL
- Connection with custom REDIS_URL
- Error handling during connection
- Event listener setup (error, connect)
- Reconnection strategy logic
- Client getter validation
- Graceful disconnection

### 2. Tenant Service Tests
**File:** `test/services/tenantService.test.ts`
**Tests:** 23 test cases

**Tenant Operations:**
- Create tenant with default settings
- Create tenant with custom settings
- Get tenant by ID
- Get tenant by domain
- Update tenant
- Handle non-existent tenants

**User Operations:**
- Create user with password hashing
- Get user by email
- Get user by ID (without password)
- Update user
- Get all users in tenant
- Password verification
- Role management (user/admin)

**Session & Token:**
- Create session with expiry
- Get session
- Delete session
- Blacklist token with default/custom expiry

### 3. Auth Plugin Tests
**File:** `test/plugins/auth.test.ts`
**Tests:** 9 test cases

- Plugin registration
- JWT strategy setup
- Valid token validation
- Tenant existence verification
- User existence verification
- Token blacklist checking
- Admin scope authorization
- User scope authorization
- Request context enhancement (tenantId, user)

### 4. Auth Routes Tests
**File:** `test/routes/auth.test.ts`
**Tests:** 18 test cases

**Registration:**
- Successful tenant and admin user creation
- Duplicate domain rejection
- Input validation

**Login:**
- Login with domain
- Login with tenantId
- Tenant not found
- Inactive tenant rejection
- User not found
- Incorrect password
- Inactive user rejection

**Protected Routes:**
- Logout with token blacklisting
- Get current user info
- Create user (admin only)
- Get all users (admin only)
- Authorization enforcement

### 5. Server Integration Tests
**File:** `test/server.test.ts`
**Tests:** 14 test cases

**Server Setup:**
- Server initialization
- CORS configuration

**Health Check:**
- Healthy status with Redis
- Unhealthy status without Redis

**API Information:**
- Root endpoint response

**Error Handling:**
- 404 Not Found
- 400 Bad Request
- 401 Unauthorized

**CORS:**
- CORS headers in response
- OPTIONS preflight requests

**Validation:**
- Valid payload acceptance
- Invalid payload rejection
- Missing fields rejection

## Total Test Count

**77 test cases** covering:
- ✅ 13 Redis client tests
- ✅ 23 Tenant service tests
- ✅ 9 Auth plugin tests
- ✅ 18 Auth routes tests
- ✅ 14 Server integration tests

## Coverage Targets

The test suite aims for:
- **Overall Coverage:** > 80%
- **Statements:** > 85%
- **Branches:** > 75%
- **Functions:** > 80%
- **Lines:** > 85%

## Viewing Coverage Report

After running `npm run test:coverage`, open the HTML report:

```bash
# macOS
open coverage/lcov-report/index.html

# Linux
xdg-open coverage/lcov-report/index.html

# Windows
start coverage/lcov-report/index.html
```

## Running Specific Tests

```bash
# Run only Redis tests
npm test -- redis.test.ts

# Run only tenant service tests
npm test -- tenantService.test.ts

# Run only auth-related tests
npm test -- auth

# Run tests matching a pattern
npm test -- --testNamePattern="should create"

# Run tests in a specific file with pattern
npm test -- auth.test.ts --testNamePattern="login"
```

## Debugging Tests

### Run a single test
```bash
npm test -- --testNamePattern="should successfully connect to Redis"
```

### Enable verbose output
```bash
npm run test:verbose
```

### Debug with Node inspector
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

Then open `chrome://inspect` in Chrome and click "inspect".

## CI/CD Integration

These tests are designed for CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run tests
  run: npm test

- name: Generate coverage
  run: npm run test:coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

## Test Development Workflow

1. **Write failing test** (TDD approach)
2. **Implement feature** to make test pass
3. **Run tests** to verify
4. **Check coverage** to ensure adequate testing
5. **Commit** code with tests

## Common Issues

### Module resolution errors
```bash
# Clear Jest cache
npx jest --clearCache

# Rebuild project
npm run clean
npm run build
```

### Mock not working
Ensure mocks are declared before imports:
```typescript
jest.mock('../../src/config/redis'); // ✅ Before import
import redisClient from '../../src/config/redis';
```

### Tests hanging
Ensure async operations are properly handled:
```typescript
// ❌ Bad
it('test', () => {
  asyncFunction();
});

// ✅ Good
it('test', async () => {
  await asyncFunction();
});
```

## Next Steps

To add new tests:
1. Create test file in `test/` directory mirroring `src/` structure
2. Import and mock dependencies
3. Write test cases following existing patterns
4. Run tests to verify
5. Check coverage report

Happy testing! 🧪✅
