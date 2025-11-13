import { RedisClientType } from 'redis';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from 'pino';
import redisClient from '../config/redis';
import logger from '../config/logger';
import {
  Tenant,
  User,
  UserWithoutPassword,
  Session,
  CreateTenantData,
  CreateUserData,
  UpdateTenantData,
  UpdateUserData
} from '../types';

class TenantService {
  private redis: RedisClientType | null = null;
  private logger: Logger;

  constructor(loggerInstance: Logger = logger) {
    this.logger = loggerInstance.child({ module: 'TenantService' });
  }

  initialize(): void {
    this.redis = redisClient.getClient();
    this.logger.info('TenantService initialized');
  }

  // Tenant Management
  async createTenant(tenantData: CreateTenantData): Promise<Tenant> {
    const tenantId = uuidv4();
    this.logger.info({ tenantId, domain: tenantData.domain }, 'Creating tenant');
    
    const tenant: Tenant = {
      tenantId,
      name: tenantData.name,
      domain: tenantData.domain,
      status: 'active',
      createdAt: new Date().toISOString(),
      settings: tenantData.settings || {}
    };

    const tenantKey = `tenant:${tenantId}`;
    await this.redis!.set(tenantKey, JSON.stringify(tenant));
    
    // Add to tenant index
    await this.redis!.sAdd('tenants:all', tenantId);
    
    // Index by domain for quick lookup
    if (tenantData.domain) {
      await this.redis!.set(`tenant:domain:${tenantData.domain}`, tenantId);
    }

    this.logger.info({ tenantId, name: tenant.name }, 'Tenant created successfully');
    return tenant;
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    this.logger.debug({ tenantId }, 'Fetching tenant');
    const tenantKey = `tenant:${tenantId}`;
    const tenantData = await this.redis!.get(tenantKey);
    
    if (!tenantData) {
      this.logger.warn({ tenantId }, 'Tenant not found');
      return null;
    }
    
    return JSON.parse(tenantData);
  }

  async getTenantByDomain(domain: string): Promise<Tenant | null> {
    this.logger.debug({ domain }, 'Fetching tenant by domain');
    const tenantId = await this.redis!.get(`tenant:domain:${domain}`);
    if (!tenantId) {
      this.logger.warn({ domain }, 'Tenant not found for domain');
      return null;
    }
    return this.getTenant(tenantId);
  }

  async updateTenant(tenantId: string, updates: UpdateTenantData): Promise<Tenant | null> {
    this.logger.info({ tenantId, updates }, 'Updating tenant');
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      this.logger.warn({ tenantId }, 'Tenant not found for update');
      return null;
    }

    const updatedTenant: Tenant = {
      ...tenant,
      ...updates,
      tenantId,
      updatedAt: new Date().toISOString()
    };

    const tenantKey = `tenant:${tenantId}`;
    await this.redis!.set(tenantKey, JSON.stringify(updatedTenant));
    this.logger.info({ tenantId }, 'Tenant updated successfully');
    return updatedTenant;
  }

  // User Management (per tenant)
  async createUser(tenantId: string, userData: CreateUserData): Promise<UserWithoutPassword> {
    const userId = uuidv4();
    this.logger.info({ tenantId, userId, email: userData.email }, 'Creating user');
    
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    const user: User = {
      userId,
      tenantId,
      username: userData.username,
      email: userData.email,
      password: hashedPassword,
      role: userData.role || 'user',
      status: 'active',
      createdAt: new Date().toISOString()
    };

    const userKey = `tenant:${tenantId}:user:${userId}`;
    await this.redis!.set(userKey, JSON.stringify(user));

    // Add to tenant's user index
    await this.redis!.sAdd(`tenant:${tenantId}:users`, userId);

    // Index by email for login
    await this.redis!.set(`tenant:${tenantId}:user:email:${userData.email}`, userId);

    this.logger.info({ tenantId, userId, username: user.username }, 'User created successfully');

    // Don't return password
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getUserByEmail(tenantId: string, email: string): Promise<User | null> {
    this.logger.debug({ tenantId, email }, 'Fetching user by email');
    const userId = await this.redis!.get(`tenant:${tenantId}:user:email:${email}`);
    if (!userId) {
      this.logger.warn({ tenantId, email }, 'User not found');
      return null;
    }

    const userKey = `tenant:${tenantId}:user:${userId}`;
    const userData = await this.redis!.get(userKey);
    return userData ? JSON.parse(userData) : null;
  }

  async getUser(tenantId: string, userId: string): Promise<UserWithoutPassword | null> {
    this.logger.debug({ tenantId, userId }, 'Fetching user');
    const userKey = `tenant:${tenantId}:user:${userId}`;
    const userData = await this.redis!.get(userKey);
    if (!userData) {
      this.logger.warn({ tenantId, userId }, 'User not found');
      return null;
    }

    const user: User = JSON.parse(userData);
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    this.logger.debug('Verifying password');
    return bcrypt.compare(password, hashedPassword);
  }

  async getAllUsers(tenantId: string): Promise<UserWithoutPassword[]> {
    this.logger.debug({ tenantId }, 'Fetching all users');
    const userIds = await this.redis!.sMembers(`tenant:${tenantId}:users`);
    const users: UserWithoutPassword[] = [];

    for (const userId of userIds) {
      const user = await this.getUser(tenantId, userId);
      if (user) users.push(user);
    }

    this.logger.info({ tenantId, count: users.length }, 'Users fetched successfully');
    return users;
  }

  async updateUser(tenantId: string, userId: string, updates: UpdateUserData): Promise<UserWithoutPassword | null> {
    this.logger.info({ tenantId, userId, updates }, 'Updating user');
    const userKey = `tenant:${tenantId}:user:${userId}`;
    const userData = await this.redis!.get(userKey);
    if (!userData) {
      this.logger.warn({ tenantId, userId }, 'User not found for update');
      return null;
    }

    const user: User = JSON.parse(userData);
    const updatedUser: User = {
      ...user,
      ...updates,
      userId,
      tenantId,
      updatedAt: new Date().toISOString()
    };

    await this.redis!.set(userKey, JSON.stringify(updatedUser));
    this.logger.info({ tenantId, userId }, 'User updated successfully');
    
    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  // Token Blacklist
  async blacklistToken(token: string, expiresIn: number = 14400): Promise<void> {
    this.logger.info({ expiresIn }, 'Blacklisting token');
    await this.redis!.setEx(`token:blacklist:${token}`, expiresIn, 'true');
    this.logger.debug('Token blacklisted successfully');
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const exists = await this.redis!.exists(`token:blacklist:${token}`);
    return exists === 1;
  }

  // Session Management
  async createSession(tenantId: string, userId: string, sessionData: Partial<Session>): Promise<Session> {
    const sessionId = uuidv4();
    this.logger.info({ tenantId, userId, sessionId }, 'Creating session');
    
    const session: Session = {
      sessionId,
      tenantId,
      userId,
      loginTime: sessionData.loginTime || new Date().toISOString(),
      userAgent: sessionData.userAgent,
      createdAt: new Date().toISOString()
    };

    const sessionKey = `session:${sessionId}`;
    await this.redis!.setEx(sessionKey, 14400, JSON.stringify(session)); // 4 hours
    
    this.logger.info({ sessionId }, 'Session created successfully');
    return session;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    this.logger.debug({ sessionId }, 'Fetching session');
    const sessionKey = `session:${sessionId}`;
    const sessionData = await this.redis!.get(sessionKey);
    return sessionData ? JSON.parse(sessionData) : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.logger.info({ sessionId }, 'Deleting session');
    const sessionKey = `session:${sessionId}`;
    await this.redis!.del(sessionKey);
    this.logger.debug({ sessionId }, 'Session deleted successfully');
  }
}

export default new TenantService();
