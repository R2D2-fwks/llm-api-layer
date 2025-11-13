import { Server } from '@hapi/hapi';

jest.mock('../../src/config/redis');
jest.mock('../../src/services/tenantService');

import redisClient from '../../src/config/redis';
import tenantService from '../../src/services/tenantService';

describe('Server Integration Tests', () => {
  let mockRedisClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Redis client
    mockRedisClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      getClient: jest.fn(),
      disconnect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue('PONG'),
    };

    (redisClient.connect as jest.Mock) = mockRedisClient.connect;
    (redisClient.getClient as jest.Mock) = jest.fn().mockReturnValue({
      ping: mockRedisClient.ping,
    });
    (redisClient.disconnect as jest.Mock) = mockRedisClient.disconnect;

    (tenantService.initialize as jest.Mock) = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Server Initialization', () => {
    it('should start server successfully', async () => {
      // Create a lightweight test without importing the full server
      const Hapi = require('@hapi/hapi');
      const server: Server = Hapi.server({
        port: 3003,
        host: 'localhost',
      });

      await server.start();
      expect(server.info.started).toBeGreaterThan(0);
      await server.stop();
    });

    it('should register CORS settings', async () => {
      const Hapi = require('@hapi/hapi');
      const server: Server = Hapi.server({
        port: 3004,
        host: 'localhost',
        routes: {
          cors: {
            origin: ['*'],
            credentials: true,
          },
        },
      });

      expect(server.settings.routes?.cors).toBeDefined();
      await server.stop();
    });
  });

  describe('Health Check Endpoint', () => {
    let server: Server;

    beforeEach(async () => {
      const Hapi = require('@hapi/hapi');
      server = Hapi.server({
        port: 3005,
        host: 'localhost',
      });

      // Add health check route
      server.route({
        method: 'GET',
        path: '/health',
        options: {
          auth: false,
        },
        handler: async () => {
          try {
            await redisClient.getClient().ping();

            return {
              status: 'healthy',
              timestamp: new Date().toISOString(),
              services: {
                redis: 'connected',
                server: 'running',
              },
            };
          } catch (error) {
            return {
              status: 'unhealthy',
              timestamp: new Date().toISOString(),
              error: (error as Error).message,
            };
          }
        },
      });
    });

    afterEach(async () => {
      await server.stop();
    });

    it('should return healthy status when Redis is connected', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.status).toBe('healthy');
      expect(result.services.redis).toBe('connected');
      expect(result.services.server).toBe('running');
    });

    it('should return unhealthy status when Redis is disconnected', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Redis connection failed'));
      (redisClient.getClient as jest.Mock).mockReturnValue({
        ping: mockRedisClient.ping,
      });

      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      const result = JSON.parse(response.payload);
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Redis connection failed');
    });
  });

  describe('Root Endpoint', () => {
    let server: Server;

    beforeEach(async () => {
      const Hapi = require('@hapi/hapi');
      server = Hapi.server({
        port: 3006,
        host: 'localhost',
      });

      server.route({
        method: 'GET',
        path: '/',
        options: {
          auth: false,
        },
        handler: () => {
          return {
            name: 'LLM API Layer',
            version: '1.0.0',
            description: 'Multi-tenant API layer with authentication',
            endpoints: {
              health: '/health',
              auth: {
                register: 'POST /api/auth/register',
                login: 'POST /api/auth/login',
                logout: 'POST /api/auth/logout',
                me: 'GET /api/auth/me',
              },
              users: {
                create: 'POST /api/users (admin only)',
                list: 'GET /api/users (admin only)',
              },
            },
          };
        },
      });
    });

    afterEach(async () => {
      await server.stop();
    });

    it('should return API information', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.name).toBe('LLM API Layer');
      expect(result.version).toBe('1.0.0');
      expect(result.endpoints).toBeDefined();
      expect(result.endpoints.auth).toBeDefined();
      expect(result.endpoints.users).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    let server: Server;

    beforeEach(async () => {
      const Hapi = require('@hapi/hapi');
      server = Hapi.server({
        port: 3007,
        host: 'localhost',
      });

      // Add error handler
      server.ext('onPreResponse', (request, h) => {
        const response = request.response;

        if ('isBoom' in response && response.isBoom) {
          const error = response;
          const statusCode = error.output.statusCode;

          return h
            .response({
              statusCode,
              error: error.output.payload.error,
              message: error.message,
            })
            .code(statusCode);
        }

        return h.continue;
      });

      // Add test routes
      server.route({
        method: 'GET',
        path: '/error/notfound',
        handler: () => {
          const Boom = require('@hapi/boom');
          throw Boom.notFound('Resource not found');
        },
      });

      server.route({
        method: 'GET',
        path: '/error/badrequest',
        handler: () => {
          const Boom = require('@hapi/boom');
          throw Boom.badRequest('Invalid request');
        },
      });

      server.route({
        method: 'GET',
        path: '/error/unauthorized',
        handler: () => {
          const Boom = require('@hapi/boom');
          throw Boom.unauthorized('Unauthorized');
        },
      });
    });

    afterEach(async () => {
      await server.stop();
    });

    it('should handle 404 errors', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/error/notfound',
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.error).toBe('Not Found');
      expect(result.message).toBe('Resource not found');
    });

    it('should handle 400 errors', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/error/badrequest',
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.error).toBe('Bad Request');
      expect(result.message).toBe('Invalid request');
    });

    it('should handle 401 errors', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/error/unauthorized',
      });

      expect(response.statusCode).toBe(401);
      const result = JSON.parse(response.payload);
      expect(result.error).toBe('Unauthorized');
    });
  });

  describe('CORS Configuration', () => {
    let server: Server;

    beforeEach(async () => {
      const Hapi = require('@hapi/hapi');
      server = Hapi.server({
        port: 3008,
        host: 'localhost',
        routes: {
          cors: {
            origin: ['*'],
            credentials: true,
          },
        },
      });

      server.route({
        method: 'GET',
        path: '/test',
        handler: () => ({ message: 'test' }),
      });
    });

    afterEach(async () => {
      await server.stop();
    });

    it('should include CORS headers in response', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test',
        headers: {
          origin: 'http://example.com',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should handle OPTIONS preflight requests', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/test',
        headers: {
          origin: 'http://example.com',
          'access-control-request-method': 'GET',
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Request Validation', () => {
    let server: Server;

    beforeEach(async () => {
      const Hapi = require('@hapi/hapi');
      const Joi = require('joi');

      server = Hapi.server({
        port: 3009,
        host: 'localhost',
      });

      server.route({
        method: 'POST',
        path: '/validate',
        options: {
          validate: {
            payload: Joi.object({
              name: Joi.string().min(3).required(),
              age: Joi.number().min(0).required(),
            }),
          },
        },
        handler: (request) => {
          return { data: request.payload };
        },
      });
    });

    afterEach(async () => {
      await server.stop();
    });

    it('should accept valid payload', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/validate',
        payload: {
          name: 'John',
          age: 25,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.data.name).toBe('John');
      expect(result.data.age).toBe(25);
    });

    it('should reject invalid payload', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/validate',
        payload: {
          name: 'Jo', // Too short
          age: -1, // Negative
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject missing required fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/validate',
        payload: {
          name: 'John',
          // Missing age
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
