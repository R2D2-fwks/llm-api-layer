import { Plugin, Request, ResponseToolkit } from '@hapi/hapi';
import JWT from '@hapi/jwt';
import { Logger } from 'pino';
import redisClient from '../config/redis';
import logger from '../config/logger';
import { AuthCredentials, JWTPayload, User } from '../types';

interface JWTArtifacts {
  decoded: {
    header: any;
    payload: JWTPayload;
    signature: string;
  };
  token: string;
}

const authPlugin: Plugin<void> = {
  name: 'auth-plugin',
  version: '1.0.0',
  register: async (server, _options) => {
    const log: Logger = logger.child({ module: 'AuthPlugin' });
    log.info('Registering auth plugin');
    
    // Register JWT strategy
    await server.register(JWT);

    server.auth.strategy('jwt', 'jwt', {
      keys: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      verify: {
        aud: false,
        iss: false,
        sub: false,
        nbf: true,
        exp: true,
        maxAgeSec: 14400, // 4 hours
        timeSkewSec: 15
      },
      validate: async (artifacts: JWTArtifacts, _request: Request, _h: ResponseToolkit) => {
        try {
          const { payload } = artifacts.decoded;
          const { token } = artifacts;
          
          log.debug({ userId: payload.userId, tenantId: payload.tenantId }, 'Validating JWT token');

          const redis = redisClient.getClient();

          // Check if token is blacklisted
          const isBlacklisted = await redis.exists(`token:blacklist:${token}`);
          if (isBlacklisted) {
            log.warn({ userId: payload.userId }, 'Token is blacklisted');
            return { isValid: false };
          }

          // Verify tenant exists
          const tenantExists = await redis.exists(`tenant:${payload.tenantId}`);
          if (!tenantExists) {
            log.warn({ tenantId: payload.tenantId }, 'Tenant does not exist');
            return { isValid: false };
          }

          // Get user data
          const userData = await redis.get(`tenant:${payload.tenantId}:user:${payload.userId}`);
          if (!userData) {
            log.warn({ userId: payload.userId, tenantId: payload.tenantId }, 'User not found');
            return { isValid: false };
          }

          const user: User = JSON.parse(userData);
          const { password, ...userWithoutPassword } = user;

          log.info({ userId: payload.userId, role: user.role }, 'Token validated successfully');

          const credentials: AuthCredentials = {
            user: userWithoutPassword,
            tenantId: payload.tenantId,
            scope: user.role === 'admin' ? ['admin', 'user'] : ['user']
          };

          return {
            isValid: true,
            credentials
          };
        } catch (error) {
          log.error({ error: error instanceof Error ? error.message : error }, 'Token validation error');
          return { isValid: false };
        }
      }
    });

    server.auth.default('jwt');

    // Pre-handler for tenant context
    server.ext('onPreHandler', (request: Request, h: ResponseToolkit) => {
      if (request.auth.isAuthenticated) {
        const credentials = request.auth.credentials as any as AuthCredentials;
        (request as any).tenantId = credentials.tenantId;
        (request as any).user = credentials.user;
        
        log.debug({ 
          path: request.path, 
          tenantId: credentials.tenantId, 
          userId: credentials.user.userId 
        }, 'Request authenticated');
      }
      return h.continue;
    });

    log.info('Auth plugin registered successfully');
  }
};

export default authPlugin;
