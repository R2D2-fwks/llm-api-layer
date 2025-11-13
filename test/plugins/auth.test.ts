import { Server } from '@hapi/hapi';
import JWT from '@hapi/jwt';

jest.mock('../../src/config/redis');

import authPlugin from '../../src/plugins/auth';
import redisClient from '../../src/config/redis';
import { User } from '../../src/types';

describe('Auth Plugin', () => {
  let server: Server;
  let mockRedisClient: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock Redis client
    mockRedisClient = {
      exists: jest.fn(),
      get: jest.fn(),
    };

    (redisClient.getClient as jest.Mock).mockReturnValue(mockRedisClient);

    // Create a test server
    const Hapi = require('@hapi/hapi');
    server = Hapi.server({
      port: 3001,
      host: 'localhost',
    });

    await server.register(JWT);
    await server.register(authPlugin);
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('Plugin Registration', () => {
    it('should register the auth plugin', () => {
      expect(server.auth.strategy).toBeDefined();
    });

    it('should set jwt as default strategy', () => {
      expect(server.auth.settings.default).toBeDefined();
    });
  });

  describe('JWT Validation', () => {
    beforeEach(() => {
      // Add a test route
      server.route({
        method: 'GET',
        path: '/test',
        options: {
          auth: 'jwt',
        },
        handler: (request) => {
          return { user: (request.auth.credentials as any).user };
        },
      });
    });

    it('should validate a valid JWT token', async () => {
      const mockUser: User = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashed-password',
        role: 'admin',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      mockRedisClient.exists.mockResolvedValue(1);
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(mockUser)) // User data
        .mockResolvedValueOnce(null); // Token not blacklisted

      const token = JWT.token.generate(
        {
          aud: 'urn:audience:api',
          iss: 'urn:issuer:api',
          userId: 'user-123',
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
        url: '/test',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject if tenant does not exist', async () => {
      mockRedisClient.exists.mockResolvedValue(0);

      const token = JWT.token.generate(
        {
          aud: 'urn:audience:api',
          iss: 'urn:issuer:api',
          userId: 'user-123',
          tenantId: 'non-existent',
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
        url: '/test',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject if user does not exist', async () => {
      mockRedisClient.exists.mockResolvedValue(1);
      mockRedisClient.get.mockResolvedValue(null);

      const token = JWT.token.generate(
        {
          aud: 'urn:audience:api',
          iss: 'urn:issuer:api',
          userId: 'non-existent',
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
        url: '/test',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject blacklisted tokens', async () => {
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
        .mockResolvedValueOnce('true'); // Token is blacklisted

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
        url: '/test',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should set correct scope for admin users', async () => {
      const mockUser: User = {
        userId: 'user-123',
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

      const token = JWT.token.generate(
        {
          aud: 'urn:audience:api',
          iss: 'urn:issuer:api',
          userId: 'user-123',
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

      // Add admin-only route
      server.route({
        method: 'GET',
        path: '/admin',
        options: {
          auth: {
            strategy: 'jwt',
            scope: ['admin'],
          },
        },
        handler: () => ({ message: 'admin access' }),
      });

      const response = await server.inject({
        method: 'GET',
        url: '/admin',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should set correct scope for regular users', async () => {
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

      // Add admin-only route
      server.route({
        method: 'GET',
        path: '/admin-only',
        options: {
          auth: {
            strategy: 'jwt',
            scope: ['admin'],
          },
        },
        handler: () => ({ message: 'admin access' }),
      });

      const response = await server.inject({
        method: 'GET',
        url: '/admin-only',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      // Regular user should not have access
      expect(response.statusCode).toBe(403);
    });
  });

  describe('onPreHandler Extension', () => {
    it('should set tenantId and user on request', async () => {
      let capturedRequest: any = null;

      server.route({
        method: 'GET',
        path: '/capture',
        options: {
          auth: 'jwt',
        },
        handler: (request) => {
          capturedRequest = request;
          return { ok: true };
        },
      });

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

      await server.inject({
        method: 'GET',
        url: '/capture',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(capturedRequest.tenantId).toBe('tenant-123');
      expect(capturedRequest.user).toBeDefined();
      expect(capturedRequest.user.userId).toBe('user-123');
    });
  });
});
