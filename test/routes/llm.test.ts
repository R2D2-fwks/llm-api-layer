import { Server } from '@hapi/hapi';
import JWT from '@hapi/jwt';

jest.mock('../../src/config/redis');
jest.mock('../../src/services/ollamaService');
jest.mock('../../src/services/tenantService');

import llmRoutes from '../../src/routes/llm';
import authPlugin from '../../src/plugins/auth';
import ollamaService from '../../src/services/ollamaService';
import tenantService from '../../src/services/tenantService';
import redisClient from '../../src/config/redis';
import { Tenant } from '../../src/types';

describe('LLM Routes', () => {
  let server: Server;
  let mockRedisClient: any;
  let mockToken: string;
  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-456';

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock Redis client
    mockRedisClient = {
      exists: jest.fn().mockResolvedValue(1), // Token not blacklisted, tenant exists
      get: jest.fn().mockResolvedValue(JSON.stringify({
        userId: mockUserId,
        tenantId: mockTenantId,
        username: 'testuser',
        email: 'test@test.com',
        password: 'hashed-password',
        role: 'user',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
      })),
      ping: jest.fn().mockResolvedValue('PONG'),
    };

    (redisClient.getClient as jest.Mock).mockReturnValue(mockRedisClient);

    // Mock tenant
    const mockTenant: Tenant = {
      tenantId: mockTenantId,
      name: 'Test Tenant',
      domain: 'test.com',
      status: 'active',
      createdAt: '2024-01-01T00:00:00.000Z',
      settings: {},
    };
    (tenantService.getTenant as jest.Mock).mockResolvedValue(mockTenant);

    // Create test server
    const Hapi = require('@hapi/hapi');
    server = Hapi.server({
      port: 3003,
      host: 'localhost',
    });

    // Register auth plugin (which internally registers JWT)
    await server.register(authPlugin);
    server.route(llmRoutes);

    // Generate a mock token
    const token = JWT.token.generate(
      {
        aud: 'urn:audience:api',
        iss: 'urn:issuer:api',
        user: {
          userId: mockUserId,
          username: 'testuser',
          email: 'test@test.com',
        },
        tenantId: mockTenantId,
        scope: ['user'],
      },
      {
        key: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
        algorithm: 'HS256',
      },
      {
        ttlSec: 14400,
      }
    );
    mockToken = token;
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('POST /api/llm/chat', () => {
    it('should successfully send a chat message to Ollama', async () => {
      const mockResponse = {
        model: 'llama2',
        created_at: '2024-01-15T10:30:00Z',
        message: {
          role: 'assistant',
          content: 'The capital of France is Paris.',
        },
        done: true,
      };

      (ollamaService.chat as jest.Mock).mockResolvedValue(mockResponse);
      mockRedisClient.exists
        .mockResolvedValueOnce(0)  // Token not blacklisted
        .mockResolvedValueOnce(1); // Tenant exists

      const response = await server.inject({
        method: 'POST',
        url: '/api/llm/chat',
        headers: {
          authorization: `Bearer ${mockToken}`,
          'x-tenant-id': mockTenantId,
        },
        payload: {
          model: 'llama2',
          messages: [
            {
              role: 'user',
              content: 'What is the capital of France?',
            },
          ],
          stream: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.model).toBe('llama2');
      expect(result.message.content).toBe('The capital of France is Paris.');
      expect(result.tenant_id).toBe(mockTenantId);
      expect(result.user_id).toBe(mockUserId);
      expect(ollamaService.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'llama2',
          messages: [
            {
              role: 'user',
              content: 'What is the capital of France?',
            },
          ],
        })
      );
    });

    it('should return 401 when token is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/llm/chat',
        headers: {
          'x-tenant-id': mockTenantId,
        },
        payload: {
          model: 'llama2',
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 when tenant ID header is missing', async () => {
      mockRedisClient.exists
        .mockResolvedValueOnce(0)  // Token not blacklisted
        .mockResolvedValueOnce(1); // Tenant exists

      const response = await server.inject({
        method: 'POST',
        url: '/api/llm/chat',
        headers: {
          authorization: `Bearer ${mockToken}`,
        },
        payload: {
          model: 'llama2',
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.message).toContain('Tenant ID header is required');
    });

    it('should return 403 when tenant ID does not match credentials', async () => {
      mockRedisClient.exists
        .mockResolvedValueOnce(0)  // Token not blacklisted
        .mockResolvedValueOnce(1); // Tenant exists

      const response = await server.inject({
        method: 'POST',
        url: '/api/llm/chat',
        headers: {
          authorization: `Bearer ${mockToken}`,
          'x-tenant-id': 'different-tenant-id',
        },
        payload: {
          model: 'llama2',
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(403);
      const result = JSON.parse(response.payload);
      expect(result.message).toBe('Tenant ID mismatch');
    });

    it('should return 400 when request validation fails', async () => {
      mockRedisClient.exists
        .mockResolvedValueOnce(0)  // Token not blacklisted
        .mockResolvedValueOnce(1); // Tenant exists

      const response = await server.inject({
        method: 'POST',
        url: '/api/llm/chat',
        headers: {
          authorization: `Bearer ${mockToken}`,
          'x-tenant-id': mockTenantId,
        },
        payload: {
          model: 'llama2',
          // Missing required 'messages' field
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 502 when Ollama service fails', async () => {
      (ollamaService.chat as jest.Mock).mockRejectedValue(
        new Error('Ollama connection failed')
      );
      mockRedisClient.exists
        .mockResolvedValueOnce(0)  // Token not blacklisted
        .mockResolvedValueOnce(1); // Tenant exists

      const response = await server.inject({
        method: 'POST',
        url: '/api/llm/chat',
        headers: {
          authorization: `Bearer ${mockToken}`,
          'x-tenant-id': mockTenantId,
        },
        payload: {
          model: 'llama2',
          messages: [
            {
              role: 'user',
              content: 'Hello',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(502);
      const result = JSON.parse(response.payload);
      expect(result.message).toContain('Ollama service error');
    });

    it('should handle multi-turn conversations', async () => {
      const mockResponse = {
        model: 'llama2',
        created_at: '2024-01-15T10:30:00Z',
        message: {
          role: 'assistant',
          content: 'Paris has a population of approximately 2.2 million people.',
        },
        done: true,
      };

      (ollamaService.chat as jest.Mock).mockResolvedValue(mockResponse);
      mockRedisClient.exists
        .mockResolvedValueOnce(0)  // Token not blacklisted
        .mockResolvedValueOnce(1); // Tenant exists

      const response = await server.inject({
        method: 'POST',
        url: '/api/llm/chat',
        headers: {
          authorization: `Bearer ${mockToken}`,
          'x-tenant-id': mockTenantId,
        },
        payload: {
          model: 'llama2',
          messages: [
            {
              role: 'user',
              content: 'What is the capital of France?',
            },
            {
              role: 'assistant',
              content: 'The capital of France is Paris.',
            },
            {
              role: 'user',
              content: 'What is its population?',
            },
          ],
          stream: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.message.content).toContain('population');
      expect(ollamaService.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user' }),
            expect.objectContaining({ role: 'assistant' }),
          ]),
        })
      );
    });
  });

  describe('GET /api/llm/models', () => {
    it('should successfully list available models', async () => {
      const mockModels = {
        models: [
          {
            name: 'llama2',
            modified_at: '2024-01-15T10:30:00Z',
            size: 3826793677,
            digest: 'sha256:abc123',
          },
          {
            name: 'mistral',
            modified_at: '2024-01-14T09:20:00Z',
            size: 4109865159,
            digest: 'sha256:def456',
          },
        ],
      };

      (ollamaService.listModels as jest.Mock).mockResolvedValue(mockModels);
      mockRedisClient.exists
        .mockResolvedValueOnce(0)  // Token not blacklisted
        .mockResolvedValueOnce(1); // Tenant exists

      const response = await server.inject({
        method: 'GET',
        url: '/api/llm/models',
        headers: {
          authorization: `Bearer ${mockToken}`,
          'x-tenant-id': mockTenantId,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.models).toHaveLength(2);
      expect(result.models[0].name).toBe('llama2');
      expect(result.models[1].name).toBe('mistral');
      expect(result.tenant_id).toBe(mockTenantId);
      expect(ollamaService.listModels).toHaveBeenCalled();
    });

    it('should return 401 when token is missing', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/llm/models',
        headers: {
          'x-tenant-id': mockTenantId,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 when tenant ID does not match', async () => {
      mockRedisClient.exists
        .mockResolvedValueOnce(0)  // Token not blacklisted
        .mockResolvedValueOnce(1); // Tenant exists

      const response = await server.inject({
        method: 'GET',
        url: '/api/llm/models',
        headers: {
          authorization: `Bearer ${mockToken}`,
          'x-tenant-id': 'wrong-tenant-id',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 502 when Ollama service fails', async () => {
      (ollamaService.listModels as jest.Mock).mockRejectedValue(
        new Error('Service unavailable')
      );
      mockRedisClient.exists
        .mockResolvedValueOnce(0)  // Token not blacklisted
        .mockResolvedValueOnce(1); // Tenant exists

      const response = await server.inject({
        method: 'GET',
        url: '/api/llm/models',
        headers: {
          authorization: `Bearer ${mockToken}`,
          'x-tenant-id': mockTenantId,
        },
      });

      expect(response.statusCode).toBe(502);
    });
  });

  describe('GET /api/llm/health', () => {
    it('should return healthy status when Ollama is available', async () => {
      (ollamaService.checkHealth as jest.Mock).mockResolvedValue(true);

      const response = await server.inject({
        method: 'GET',
        url: '/api/llm/health',
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.status).toBe('healthy');
      expect(result.service).toBe('ollama');
      expect(result.timestamp).toBeDefined();
      expect(ollamaService.checkHealth).toHaveBeenCalled();
    });

    it('should return 503 when Ollama is unavailable', async () => {
      (ollamaService.checkHealth as jest.Mock).mockResolvedValue(false);

      const response = await server.inject({
        method: 'GET',
        url: '/api/llm/health',
      });

      expect(response.statusCode).toBe(503);
      const result = JSON.parse(response.payload);
      expect(result.status).toBe('unhealthy');
      expect(result.service).toBe('ollama');
      expect(result.timestamp).toBeDefined();
    });

    it('should return 503 when health check throws an error', async () => {
      (ollamaService.checkHealth as jest.Mock).mockRejectedValue(
        new Error('Connection refused')
      );

      const response = await server.inject({
        method: 'GET',
        url: '/api/llm/health',
      });

      expect(response.statusCode).toBe(503);
      const result = JSON.parse(response.payload);
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBeDefined();
    });

    it('should be accessible without authentication', async () => {
      (ollamaService.checkHealth as jest.Mock).mockResolvedValue(true);

      // No authorization header
      const response = await server.inject({
        method: 'GET',
        url: '/api/llm/health',
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
