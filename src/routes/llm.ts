import { ServerRoute, Request, ResponseToolkit } from '@hapi/hapi';
import Boom from '@hapi/boom';
import Joi from 'joi';
import { Logger } from 'pino';
import ollamaService, { OllamaChatRequest } from '../services/ollamaService';
import logger from '../config/logger';
import { AuthCredentials } from '../types';

const log: Logger = logger.child({ module: 'LLMRoutes' });

// Validation schemas
const chatRequestSchema = Joi.object({
  model: Joi.string().required().description('Model name (e.g., llama2, mistral, codellama)'),
  messages: Joi.array().items(
    Joi.object({
      role: Joi.string().valid('system', 'user', 'assistant').required(),
      content: Joi.string().required()
    })
  ).min(1).required().description('Array of chat messages'),
  stream: Joi.boolean().optional().default(false).description('Enable streaming response'),
  options: Joi.object({
    temperature: Joi.number().min(0).max(2).optional(),
    top_p: Joi.number().min(0).max(1).optional(),
    top_k: Joi.number().integer().min(1).optional(),
    num_predict: Joi.number().integer().min(1).optional(),
    stop: Joi.array().items(Joi.string()).optional()
  }).optional()
});

const llmRoutes: ServerRoute[] = [
  {
    method: 'POST',
    path: '/api/llm/chat',
    options: {
      auth: 'jwt',
      validate: {
        payload: chatRequestSchema,
        headers: Joi.object({
          'x-tenant-id': Joi.string().uuid().required(),
          authorization: Joi.string().required()
        }).unknown()
      },
      description: 'Chat with LLM (Ollama wrapper)',
      notes: 'Sends chat messages to Ollama and returns the response. Requires authentication and tenant ID in header.',
      tags: ['api', 'llm'],
      response: {
        schema: Joi.object({
          model: Joi.string(),
          message: Joi.object({
            role: Joi.string(),
            content: Joi.string()
          }),
          created_at: Joi.string(),
          done: Joi.boolean(),
          total_duration: Joi.number().optional(),
          load_duration: Joi.number().optional(),
          prompt_eval_count: Joi.number().optional(),
          prompt_eval_duration: Joi.number().optional(),
          eval_count: Joi.number().optional(),
          eval_duration: Joi.number().optional(),
          tenant_id: Joi.string(),
          user_id: Joi.string()
        })
      }
    },
    handler: async (request: Request) => {
      try {
        const credentials = request.auth.credentials as any as AuthCredentials;
        const headerTenantId = request.headers['x-tenant-id'];
        const chatRequest = request.payload as OllamaChatRequest;

        log.info({ 
          userId: credentials.user.userId, 
          credentialsTenantId: credentials.tenantId,
          headerTenantId,
          model: chatRequest.model 
        }, 'LLM chat request received');

        // Verify tenant ID matches the authenticated user's tenant
        if (headerTenantId !== credentials.tenantId) {
          log.warn({ 
            userId: credentials.user.userId,
            credentialsTenantId: credentials.tenantId,
            headerTenantId 
          }, 'Tenant ID mismatch');
          
          throw Boom.forbidden('Tenant ID does not match authenticated user');
        }

        // Check if streaming is requested
        if (chatRequest.stream) {
          log.info({ 
            tenantId: credentials.tenantId,
            userId: credentials.user.userId 
          }, 'Streaming not yet implemented, falling back to non-streaming');
          
          // For now, we'll just set stream to false
          // TODO: Implement proper streaming support
          chatRequest.stream = false;
        }

        // Call Ollama service
        const response = await ollamaService.chat(chatRequest, credentials.tenantId);

        log.info({ 
          tenantId: credentials.tenantId,
          userId: credentials.user.userId,
          model: response.model,
          done: response.done
        }, 'LLM chat response returned');

        // Add tenant and user context to response
        return {
          ...response,
          tenant_id: credentials.tenantId,
          user_id: credentials.user.userId
        };
      } catch (error) {
        if (Boom.isBoom(error)) {
          throw error;
        }
        
        log.error({ 
          error: error instanceof Error ? error.message : error 
        }, 'LLM chat request failed');
        
        throw Boom.badImplementation('Failed to process chat request');
      }
    }
  },
  {
    method: 'GET',
    path: '/api/llm/models',
    options: {
      auth: 'jwt',
      validate: {
        headers: Joi.object({
          'x-tenant-id': Joi.string().uuid().required(),
          authorization: Joi.string().required()
        }).unknown()
      },
      description: 'List available LLM models',
      notes: 'Returns list of available models from Ollama',
      tags: ['api', 'llm']
    },
    handler: async (request: Request, _h: ResponseToolkit) => {
      try {
        const credentials = request.auth.credentials as any as AuthCredentials;
        const headerTenantId = request.headers['x-tenant-id'];

        log.info({ 
          userId: credentials.user.userId,
          tenantId: credentials.tenantId 
        }, 'List models request received');

        // Verify tenant ID matches
        if (headerTenantId !== credentials.tenantId) {
          log.warn({ 
            userId: credentials.user.userId,
            credentialsTenantId: credentials.tenantId,
            headerTenantId 
          }, 'Tenant ID mismatch');
          
          throw Boom.forbidden('Tenant ID does not match authenticated user');
        }

        const models = await ollamaService.listModels();

        log.info({ 
          tenantId: credentials.tenantId,
          modelCount: models.models?.length || 0 
        }, 'Models list returned');

        return {
          ...models,
          tenant_id: credentials.tenantId
        };
      } catch (error) {
        if (Boom.isBoom(error)) {
          throw error;
        }
        
        log.error({ 
          error: error instanceof Error ? error.message : error 
        }, 'Failed to list models');
        
        throw Boom.badImplementation('Failed to fetch models');
      }
    }
  },
  {
    method: 'GET',
    path: '/api/llm/health',
    options: {
      auth: false,
      description: 'Check Ollama service health',
      notes: 'Returns health status of Ollama service',
      tags: ['api', 'llm', 'health']
    },
    handler: async (_request: Request, h: ResponseToolkit) => {
      try {
        const isHealthy = await ollamaService.checkHealth();

        if (isHealthy) {
          return {
            status: 'healthy',
            service: 'ollama',
            timestamp: new Date().toISOString()
          };
        } else {
          return h.response({
            status: 'unhealthy',
            service: 'ollama',
            timestamp: new Date().toISOString()
          }).code(503);
        }
      } catch (error) {
        log.error({ 
          error: error instanceof Error ? error.message : error 
        }, 'Ollama health check failed');
        
        return h.response({
          status: 'unhealthy',
          service: 'ollama',
          error: 'Health check failed',
          timestamp: new Date().toISOString()
        }).code(503);
      }
    }
  }
];

export default llmRoutes;
