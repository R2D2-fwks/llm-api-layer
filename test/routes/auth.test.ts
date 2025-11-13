import { Server } from '@hapi/hapi';
import JWT from '@hapi/jwt';

jest.mock('../../src/config/redis');
jest.mock('../../src/services/tenantService');

import authRoutes from '../../src/routes/auth';
import authPlugin from '../../src/plugins/auth';
import tenantService from '../../src/services/tenantService';
import redisClient from '../../src/config/redis';
import { Tenant, User } from '../../src/types';

describe('Auth Routes', () => {
  let server: Server;
  let mockRedisClient: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock Redis client
    mockRedisClient = {
      exists: jest.fn(),
      get: jest.fn(),
      ping: jest.fn().mockResolvedValue('PONG'),
    };

    (redisClient.getClient as jest.Mock).mockReturnValue(mockRedisClient);

    // Create test server
    const Hapi = require('@hapi/hapi');
    server = Hapi.server({
      port: 3002,
      host: 'localhost',
    });

    await server.register(JWT);
    await server.register(authPlugin);
    server.route(authRoutes);
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new tenant with admin user', async () => {
      const mockTenant: Tenant = {
        tenantId: 'tenant-123',
        name: 'Test Corp',
        domain: 'test.com',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
        settings: {},
      };

      const mockUser = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        username: 'admin',
        email: 'admin@test.com',
        role: 'admin',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (tenantService.getTenantByDomain as jest.Mock).mockResolvedValue(null);
      (tenantService.createTenant as jest.Mock).mockResolvedValue(mockTenant);
      (tenantService.createUser as jest.Mock).mockResolvedValue(mockUser);

      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          tenantName: 'Test Corp',
          domain: 'test.com',
          username: 'admin',
          email: 'admin@test.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(201);
      const result = JSON.parse(response.payload);
      expect(result.message).toBe('Tenant and admin user created successfully');
      expect(result.tenant).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.token).toBeDefined();
    });

    it('should reject if tenant with domain already exists', async () => {
      const existingTenant: Tenant = {
        tenantId: 'existing-123',
        name: 'Existing Corp',
        domain: 'test.com',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
        settings: {},
      };

      (tenantService.getTenantByDomain as jest.Mock).mockResolvedValue(existingTenant);

      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          tenantName: 'Test Corp',
          domain: 'test.com',
          username: 'admin',
          email: 'admin@test.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(409);
      const result = JSON.parse(response.payload);
      expect(result.message).toBe('Tenant with this domain already exists');
    });

    it('should validate required fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          tenantName: 'Test',
          // Missing required fields
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    const mockTenant: Tenant = {
      tenantId: 'tenant-123',
      name: 'Test Corp',
      domain: 'test.com',
      status: 'active',
      createdAt: '2024-01-01T00:00:00.000Z',
      settings: {},
    };

    const mockUser: User = {
      userId: 'user-123',
      tenantId: 'tenant-123',
      username: 'testuser',
      email: 'test@test.com',
      password: 'hashed-password',
      role: 'user',
      status: 'active',
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    it('should login with domain', async () => {
      (tenantService.getTenantByDomain as jest.Mock).mockResolvedValue(mockTenant);
      (tenantService.getUserByEmail as jest.Mock).mockResolvedValue(mockUser);
      (tenantService.verifyPassword as jest.Mock).mockResolvedValue(true);
      (tenantService.createSession as jest.Mock).mockResolvedValue({
        sessionId: 'session-123',
        tenantId: 'tenant-123',
        userId: 'user-123',
        loginTime: '2024-01-01T00:00:00.000Z',
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'test@test.com',
          password: 'password123',
          domain: 'test.com',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.message).toBe('Login successful');
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.sessionId).toBe('session-123');
    });

    it('should login with tenantId', async () => {
      (tenantService.getTenant as jest.Mock).mockResolvedValue(mockTenant);
      (tenantService.getUserByEmail as jest.Mock).mockResolvedValue(mockUser);
      (tenantService.verifyPassword as jest.Mock).mockResolvedValue(true);
      (tenantService.createSession as jest.Mock).mockResolvedValue({
        sessionId: 'session-123',
        tenantId: 'tenant-123',
        userId: 'user-123',
        loginTime: '2024-01-01T00:00:00.000Z',
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'test@test.com',
          password: 'password123',
          tenantId: 'tenant-123',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject if tenant not found', async () => {
      (tenantService.getTenantByDomain as jest.Mock).mockResolvedValue(null);

      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'test@test.com',
          password: 'password123',
          domain: 'nonexistent.com',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should reject if tenant is not active', async () => {
      (tenantService.getTenantByDomain as jest.Mock).mockResolvedValue({
        ...mockTenant,
        status: 'inactive',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'test@test.com',
          password: 'password123',
          domain: 'test.com',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should reject if user not found', async () => {
      (tenantService.getTenantByDomain as jest.Mock).mockResolvedValue(mockTenant);
      (tenantService.getUserByEmail as jest.Mock).mockResolvedValue(null);

      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'nonexistent@test.com',
          password: 'password123',
          domain: 'test.com',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject if password is incorrect', async () => {
      (tenantService.getTenantByDomain as jest.Mock).mockResolvedValue(mockTenant);
      (tenantService.getUserByEmail as jest.Mock).mockResolvedValue(mockUser);
      (tenantService.verifyPassword as jest.Mock).mockResolvedValue(false);

      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'test@test.com',
          password: 'wrongpassword',
          domain: 'test.com',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject if user account is not active', async () => {
      (tenantService.getTenantByDomain as jest.Mock).mockResolvedValue(mockTenant);
      (tenantService.getUserByEmail as jest.Mock).mockResolvedValue({
        ...mockUser,
        status: 'inactive',
      });
      (tenantService.verifyPassword as jest.Mock).mockResolvedValue(true);

      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'test@test.com',
          password: 'password123',
          domain: 'test.com',
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout and blacklist token', async () => {
      (tenantService.blacklistToken as jest.Mock).mockResolvedValue(undefined);

      const mockUser: User = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashed-password',
        role: 'user',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      mockRedisClient.exists.mockResolvedValue(1);
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(mockUser))
        .mockResolvedValueOnce(null);

      const token = JWT.token.generate(
        {
          aud: 'urn:audience:api',
          iss: 'urn:issuer:api',
          userId: 'user-123',
          tenantId: 'tenant-123',
          role: 'user',
        },
        {
          key: 'your-secret-key-change-in-production',
          algorithm: 'HS256',
        },
        {
          ttlSec: 14400,
        }
      );

      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.message).toBe('Logout successful');
      expect(tenantService.blacklistToken).toHaveBeenCalledWith(token);
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/logout',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user information', async () => {
      const mockTenant: Tenant = {
        tenantId: 'tenant-123',
        name: 'Test Corp',
        domain: 'test.com',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
        settings: {},
      };

      const mockUser: User = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashed-password',
        role: 'user',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      mockRedisClient.exists.mockResolvedValue(1);
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(mockUser))
        .mockResolvedValueOnce(null);

      (tenantService.getTenant as jest.Mock).mockResolvedValue(mockTenant);

      const token = JWT.token.generate(
        {
          aud: 'urn:audience:api',
          iss: 'urn:issuer:api',
          userId: 'user-123',
          tenantId: 'tenant-123',
          role: 'user',
        },
        {
          key: 'your-secret-key-change-in-production',
          algorithm: 'HS256',
        },
        {
          ttlSec: 14400,
        }
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.user).toBeDefined();
      expect(result.tenant).toBeDefined();
    });

    it('should require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/users', () => {
    it('should create a new user (admin only)', async () => {
      const mockUser: User = {
        userId: 'admin-123',
        tenantId: 'tenant-123',
        username: 'admin',
        email: 'admin@example.com',
        password: 'hashed-password',
        role: 'admin',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const newUser = {
        userId: 'user-456',
        tenantId: 'tenant-123',
        username: 'newuser',
        email: 'newuser@example.com',
        role: 'user',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      mockRedisClient.exists.mockResolvedValue(1);
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(mockUser))
        .mockResolvedValueOnce(null);

      (tenantService.getUserByEmail as jest.Mock).mockResolvedValue(null);
      (tenantService.createUser as jest.Mock).mockResolvedValue(newUser);

      const token = JWT.token.generate(
        {
          aud: 'urn:audience:api',
          iss: 'urn:issuer:api',
          userId: 'admin-123',
          tenantId: 'tenant-123',
          role: 'admin',
        },
        {
          key: 'your-secret-key-change-in-production',
          algorithm: 'HS256',
        },
        {
          ttlSec: 14400,
        }
      );

      const response = await server.inject({
        method: 'POST',
        url: '/api/users',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'password123',
          role: 'user',
        },
      });

      expect(response.statusCode).toBe(201);
      const result = JSON.parse(response.payload);
      expect(result.message).toBe('User created successfully');
      expect(result.user).toBeDefined();
    });

    it('should reject if user with email already exists', async () => {
      const mockUser: User = {
        userId: 'admin-123',
        tenantId: 'tenant-123',
        username: 'admin',
        email: 'admin@example.com',
        password: 'hashed-password',
        role: 'admin',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      mockRedisClient.exists.mockResolvedValue(1);
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(mockUser))
        .mockResolvedValueOnce(null);

      (tenantService.getUserByEmail as jest.Mock).mockResolvedValue({
        userId: 'existing-123',
        email: 'newuser@example.com',
      });

      const token = JWT.token.generate(
        {
          aud: 'urn:audience:api',
          iss: 'urn:issuer:api',
          userId: 'admin-123',
          tenantId: 'tenant-123',
          role: 'admin',
        },
        {
          key: 'your-secret-key-change-in-production',
          algorithm: 'HS256',
        },
        {
          ttlSec: 14400,
        }
      );

      const response = await server.inject({
        method: 'POST',
        url: '/api/users',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(409);
    });

    it('should require admin role', async () => {
      const mockUser: User = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        username: 'user',
        email: 'user@example.com',
        password: 'hashed-password',
        role: 'user',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      mockRedisClient.exists.mockResolvedValue(1);
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(mockUser))
        .mockResolvedValueOnce(null);

      const token = JWT.token.generate(
        {
          aud: 'urn:audience:api',
          iss: 'urn:issuer:api',
          userId: 'user-123',
          tenantId: 'tenant-123',
          role: 'user',
        },
        {
          key: 'your-secret-key-change-in-production',
          algorithm: 'HS256',
        },
        {
          ttlSec: 14400,
        }
      );

      const response = await server.inject({
        method: 'POST',
        url: '/api/users',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/users', () => {
    it('should get all users in tenant (admin only)', async () => {
      const mockAdmin: User = {
        userId: 'admin-123',
        tenantId: 'tenant-123',
        username: 'admin',
        email: 'admin@example.com',
        password: 'hashed-password',
        role: 'admin',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      mockRedisClient.exists.mockResolvedValue(1);
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(mockAdmin))
        .mockResolvedValueOnce(null);

      (tenantService.getAllUsers as jest.Mock).mockResolvedValue([
        { userId: 'user-1', username: 'user1' },
        { userId: 'user-2', username: 'user2' },
      ]);

      const token = JWT.token.generate(
        {
          aud: 'urn:audience:api',
          iss: 'urn:issuer:api',
          userId: 'admin-123',
          tenantId: 'tenant-123',
          role: 'admin',
        },
        {
          key: 'your-secret-key-change-in-production',
          algorithm: 'HS256',
        },
        {
          ttlSec: 14400,
        }
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/users',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.users).toHaveLength(2);
      expect(result.count).toBe(2);
    });

    it('should require admin role', async () => {
      const mockUser: User = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        username: 'user',
        email: 'user@example.com',
        password: 'hashed-password',
        role: 'user',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      mockRedisClient.exists.mockResolvedValue(1);
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(mockUser))
        .mockResolvedValueOnce(null);

      const token = JWT.token.generate(
        {
          aud: 'urn:audience:api',
          iss: 'urn:issuer:api',
          userId: 'user-123',
          tenantId: 'tenant-123',
          role: 'user',
        },
        {
          key: 'your-secret-key-change-in-production',
          algorithm: 'HS256',
        },
        {
          ttlSec: 14400,
        }
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/users',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
