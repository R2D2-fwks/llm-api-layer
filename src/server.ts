import 'dotenv/config';
import Hapi, { Request, ResponseToolkit, Server } from '@hapi/hapi';
import Inert from '@hapi/inert';
import Vision from '@hapi/vision';
import redisClient from './config/redis';
import authPlugin from './plugins/auth';
import authRoutes from './routes/auth';
import docsRoutes from './routes/docs';
import tenantService from './services/tenantService';
import logger from './config/logger';

const init = async (): Promise<void> => {
  logger.info('Initializing server');
  // Create Hapi server
  const server: Server = Hapi.server({
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    routes: {
      cors: {
        origin: ['*'],
        credentials: true
      },
      validate: {
        failAction: async (_request: Request, _h: ResponseToolkit, err?: Error) => {
          if (process.env.NODE_ENV === 'production') {
            logger.error({ error: err?.message }, 'Validation error');
            throw err;
          } else {
            logger.error({ error: err }, 'Validation error');
            throw err;
          }
        }
      }
    }
  });

  try {
    // Connect to Redis
    logger.info('Connecting to Redis');
    await redisClient.connect();
    
    // Initialize tenant service
    tenantService.initialize();

    // Register plugins
    await server.register([
      Inert,
      Vision
    ]);

    // Register auth plugin
    await server.register(authPlugin);

    // Register routes
    server.route(authRoutes);
    server.route(docsRoutes);

    // Health check route (no auth required)
    server.route({
      method: 'GET',
      path: '/health',
      options: {
        auth: false,
        description: 'Health check endpoint',
        tags: ['health']
      },
      handler: async (_request: Request, h: ResponseToolkit) => {
        try {
          // Check Redis connection
          await redisClient.getClient().ping();
          
          logger.debug('Health check: healthy');
          
          return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {
              redis: 'connected',
              server: 'running'
            }
          };
        } catch (error) {
          logger.error({ error: error instanceof Error ? error.message : error }, 'Health check failed');
          return h.response({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: (error as Error).message
          }).code(503);
        }
      }
    });

    // Root route
    server.route({
      method: 'GET',
      path: '/',
      options: {
        auth: false,
        description: 'API information',
        tags: ['info']
      },
      handler: (_request: Request, _h: ResponseToolkit) => {
        return {
          name: 'LLM API Layer',
          version: '1.0.0',
          description: 'Multi-tenant API layer with authentication',
          endpoints: {
            health: '/health',
            documentation: {
              ui: 'GET /api-docs',
              openapi: 'GET /api-docs/openapi.yml'
            },
            auth: {
              register: 'POST /api/auth/register',
              login: 'POST /api/auth/login',
              logout: 'POST /api/auth/logout',
              me: 'GET /api/auth/me'
            },
            users: {
              create: 'POST /api/users (admin only)',
              list: 'GET /api/users (admin only)'
            }
          }
        };
      }
    });

    // Error handling
    server.ext('onPreResponse', (request: Request, h: ResponseToolkit) => {
      const response = request.response;
      
      if ('isBoom' in response && response.isBoom) {
        const error = response;
        const statusCode = error.output.statusCode;
        
        logger.error({
          path: request.path,
          method: request.method,
          statusCode,
          error: error.message
        }, 'Request error');
        
        return h.response({
          statusCode,
          error: error.output.payload.error,
          message: error.message
        }).code(statusCode);
      }
      
      return h.continue;
    });

    // Graceful shutdown
    const shutdown = async (): Promise<void> => {
      logger.info('Shutting down gracefully');
      await server.stop({ timeout: 10000 });
      await redisClient.disconnect();
      logger.info('Server stopped');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // Start server
    await server.start();
    logger.info({ 
      uri: server.info.uri, 
      environment: process.env.NODE_ENV || 'development' 
    }, 'Server started successfully');

  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to start server');
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('unhandledRejection', (err: Error) => {
  logger.error({ error: err.message }, 'Unhandled rejection');
  process.exit(1);
});

init();
