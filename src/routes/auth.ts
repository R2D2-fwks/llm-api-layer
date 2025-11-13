import { ServerRoute, Request, ResponseToolkit } from '@hapi/hapi';
import Boom from '@hapi/boom';
import Joi from 'joi';
import JWT from '@hapi/jwt';
import { Logger } from 'pino';
import tenantService from '../services/tenantService';
import logger from '../config/logger';
import { AuthCredentials, RegisterPayload, LoginPayload, CreateUserData, UserWithoutPassword } from '../types';

const log: Logger = logger.child({ module: 'AuthRoutes' });

// Validation schemas
const registerSchema = Joi.object({
  tenantName: Joi.string().min(3).max(100).required(),
  domain: Joi.string().domain().required(),
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  tenantId: Joi.string().uuid().optional(),
  domain: Joi.string().domain().optional()
}).xor('tenantId', 'domain'); // Either tenantId or domain must be provided

const createUserSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  role: Joi.string().valid('user', 'admin').default('user')
});

// Generate JWT token
const generateToken = (user: UserWithoutPassword, tenantId: string): string => {
  const token = JWT.token.generate(
    {
      aud: 'urn:audience:api',
      iss: 'urn:issuer:api',
      userId: user.userId,
      tenantId: tenantId,
      role: user.role
    },
    {
      key: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      algorithm: 'HS256'
    },
    {
      ttlSec: 14400 // 4 hours
    }
  );
  return token;
};

const authRoutes: ServerRoute[] = [
  {
    method: 'POST',
    path: '/api/auth/register',
    options: {
      auth: false,
      validate: {
        payload: registerSchema
      },
      description: 'Register a new tenant with admin user',
      tags: ['api', 'auth']
    },
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const { tenantName, domain, username, email, password } = request.payload as RegisterPayload;
        
        log.info({ domain, email }, 'Registration attempt');

        // Check if tenant with domain already exists
        const existingTenant = await tenantService.getTenantByDomain(domain);
        if (existingTenant) {
          log.warn({ domain }, 'Tenant with domain already exists');
          throw Boom.conflict('Tenant with this domain already exists');
        }

        // Create tenant
        const tenant = await tenantService.createTenant({
          name: tenantName,
          domain: domain
        });

        // Create admin user for tenant
        const user = await tenantService.createUser(tenant.tenantId, {
          username,
          email,
          password,
          role: 'admin'
        });

        // Generate token
        const token = generateToken(user, tenant.tenantId);

        log.info({ tenantId: tenant.tenantId, userId: user.userId }, 'Registration successful');

        return h.response({
          message: 'Tenant and admin user created successfully',
          tenant: {
            tenantId: tenant.tenantId,
            name: tenant.name,
            domain: tenant.domain
          },
          user,
          token
        }).code(201);
      } catch (error) {
        if (Boom.isBoom(error)) {
          throw error;
        }
        log.error({ error: error instanceof Error ? error.message : error }, 'Registration error');
        throw Boom.badImplementation('Failed to register tenant');
      }
    }
  },
  {
    method: 'POST',
    path: '/api/auth/login',
    options: {
      auth: false,
      validate: {
        payload: loginSchema
      },
      description: 'Login to tenant account',
      tags: ['api', 'auth']
    },
    handler: async (request: Request, _h: ResponseToolkit) => {
      try {
        const { email, password, tenantId, domain } = request.payload as LoginPayload;
        
        log.info({ email, tenantId, domain }, 'Login attempt');

        // Get tenant
        let tenant;
        if (tenantId) {
          tenant = await tenantService.getTenant(tenantId);
        } else if (domain) {
          tenant = await tenantService.getTenantByDomain(domain);
        }

        if (!tenant) {
          log.warn({ tenantId, domain }, 'Tenant not found');
          throw Boom.notFound('Tenant not found');
        }

        if (tenant.status !== 'active') {
          log.warn({ tenantId: tenant.tenantId, status: tenant.status }, 'Tenant not active');
          throw Boom.forbidden('Tenant is not active');
        }

        // Get user by email
        const user = await tenantService.getUserByEmail(tenant.tenantId, email);
        if (!user) {
          log.warn({ email, tenantId: tenant.tenantId }, 'User not found');
          throw Boom.unauthorized('Invalid credentials');
        }

        // Verify password
        const isValid = await tenantService.verifyPassword(password, user.password);
        if (!isValid) {
          log.warn({ email, tenantId: tenant.tenantId }, 'Invalid password');
          throw Boom.unauthorized('Invalid credentials');
        }

        if (user.status !== 'active') {
          log.warn({ userId: user.userId, status: user.status }, 'User account not active');
          throw Boom.forbidden('User account is not active');
        }

        // Generate token
        const { password: _, ...userWithoutPassword } = user;
        const token = generateToken(userWithoutPassword, tenant.tenantId);

        // Create session
        const session = await tenantService.createSession(tenant.tenantId, user.userId, {
          loginTime: new Date().toISOString(),
          userAgent: request.headers['user-agent']
        } as any);

        log.info({ userId: user.userId, tenantId: tenant.tenantId, sessionId: session.sessionId }, 'Login successful');

        return {
          message: 'Login successful',
          token,
          user: userWithoutPassword,
          tenant: {
            tenantId: tenant.tenantId,
            name: tenant.name,
            domain: tenant.domain
          },
          sessionId: session.sessionId
        };
      } catch (error) {
        if (Boom.isBoom(error)) {
          throw error;
        }
        log.error({ error: error instanceof Error ? error.message : error }, 'Login error');
        throw Boom.badImplementation('Failed to login');
      }
    }
  },
  {
    method: 'POST',
    path: '/api/auth/logout',
    options: {
      auth: 'jwt',
      description: 'Logout and invalidate token',
      tags: ['api', 'auth']
    },
    handler: async (request: Request, _h: ResponseToolkit) => {
      try {
        const credentials = request.auth.credentials as any as AuthCredentials;
        const authHeader = request.headers.authorization;
        if (!authHeader) {
          throw Boom.unauthorized('No authorization header');
        }
        
        const token = authHeader.split(' ')[1];
        
        log.info({ userId: credentials.user.userId, tenantId: credentials.tenantId }, 'Logout attempt');
        
        // Blacklist the token
        await tenantService.blacklistToken(token);

        log.info({ userId: credentials.user.userId }, 'Logout successful');

        return {
          message: 'Logout successful'
        };
      } catch (error) {
        log.error({ error: error instanceof Error ? error.message : error }, 'Logout error');
        throw Boom.badImplementation('Failed to logout');
      }
    }
  },
  {
    method: 'GET',
    path: '/api/auth/me',
    options: {
      auth: 'jwt',
      description: 'Get current user information',
      tags: ['api', 'auth']
    },
    handler: async (request: Request, _h: ResponseToolkit) => {
      try {
        const credentials = request.auth.credentials as any as AuthCredentials;
        const { user, tenantId } = credentials;
        
        log.debug({ userId: user.userId, tenantId }, 'Fetching current user info');
        
        const tenant = await tenantService.getTenant(tenantId);

        return {
          user,
          tenant: tenant ? {
            tenantId: tenant.tenantId,
            name: tenant.name,
            domain: tenant.domain
          } : null
        };
      } catch (error) {
        log.error({ error: error instanceof Error ? error.message : error }, 'Get user error');
        throw Boom.badImplementation('Failed to get user information');
      }
    }
  },
  {
    method: 'POST',
    path: '/api/users',
    options: {
      auth: {
        strategy: 'jwt',
        scope: ['admin']
      },
      validate: {
        payload: createUserSchema
      },
      description: 'Create a new user in tenant (admin only)',
      tags: ['api', 'users']
    },
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const credentials = request.auth.credentials as any as AuthCredentials;
        const { tenantId } = credentials;
        const userData = request.payload as CreateUserData;

        log.info({ tenantId, email: userData.email }, 'Admin creating new user');

        // Check if user with email already exists in tenant
        const existingUser = await tenantService.getUserByEmail(tenantId, userData.email);
        if (existingUser) {
          log.warn({ tenantId, email: userData.email }, 'User with email already exists');
          throw Boom.conflict('User with this email already exists in tenant');
        }

        const user = await tenantService.createUser(tenantId, userData);

        log.info({ userId: user.userId, tenantId }, 'User created by admin');

        return h.response({
          message: 'User created successfully',
          user
        }).code(201);
      } catch (error) {
        if (Boom.isBoom(error)) {
          throw error;
        }
        log.error({ error: error instanceof Error ? error.message : error }, 'Create user error');
        throw Boom.badImplementation('Failed to create user');
      }
    }
  },
  {
    method: 'GET',
    path: '/api/users',
    options: {
      auth: {
        strategy: 'jwt',
        scope: ['admin']
      },
      description: 'Get all users in tenant (admin only)',
      tags: ['api', 'users']
    },
    handler: async (request: Request, _h: ResponseToolkit) => {
      try {
        const credentials = request.auth.credentials as any as AuthCredentials;
        const { tenantId } = credentials;
        
        log.debug({ tenantId }, 'Admin fetching all users');
        
        const users = await tenantService.getAllUsers(tenantId);

        return {
          users,
          count: users.length
        };
      } catch (error) {
        log.error({ error: error instanceof Error ? error.message : error }, 'Get users error');
        throw Boom.badImplementation('Failed to get users');
      }
    }
  }
];

export default authRoutes;
