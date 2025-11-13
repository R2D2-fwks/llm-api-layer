import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { RedisClientType } from 'redis';

// Mock dependencies
jest.mock('bcrypt');
jest.mock('uuid');
jest.mock('../../src/config/redis');

import tenantService from '../../src/services/tenantService';
import redisClient from '../../src/config/redis';
import { CreateTenantData, CreateUserData, User } from '../../src/types';

describe('TenantService', () => {
  let mockRedisClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Redis client methods
    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      sAdd: jest.fn(),
      sMembers: jest.fn(),
      setEx: jest.fn(),
    };

    (redisClient.getClient as jest.Mock) = jest.fn().mockReturnValue(mockRedisClient);

    // Initialize service
    tenantService.initialize();

    // Mock uuid
    (uuidv4 as jest.Mock).mockReturnValue('mock-uuid-1234');

    // Mock bcrypt
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createTenant', () => {
    it('should create a new tenant', async () => {
      const tenantData: CreateTenantData = {
        name: 'Test Corp',
        domain: 'test.com',
      };

      const tenant = await tenantService.createTenant(tenantData);

      expect(tenant).toEqual({
        tenantId: 'mock-uuid-1234',
        name: 'Test Corp',
        domain: 'test.com',
        status: 'active',
        createdAt: expect.any(String),
        settings: {},
      });

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'tenant:mock-uuid-1234',
        expect.any(String)
      );
      expect(mockRedisClient.sAdd).toHaveBeenCalledWith('tenants:all', 'mock-uuid-1234');
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'tenant:domain:test.com',
        'mock-uuid-1234'
      );
    });

    it('should create tenant with custom settings', async () => {
      const tenantData: CreateTenantData = {
        name: 'Test Corp',
        domain: 'test.com',
        settings: { maxUsers: 100 },
      };

      const tenant = await tenantService.createTenant(tenantData);

      expect(tenant.settings).toEqual({ maxUsers: 100 });
    });
  });

  describe('getTenant', () => {
    it('should retrieve a tenant by ID', async () => {
      const mockTenant = {
        tenantId: 'tenant-123',
        name: 'Test Corp',
        domain: 'test.com',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
        settings: {},
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockTenant));

      const tenant = await tenantService.getTenant('tenant-123');

      expect(mockRedisClient.get).toHaveBeenCalledWith('tenant:tenant-123');
      expect(tenant).toEqual(mockTenant);
    });

    it('should return null if tenant does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const tenant = await tenantService.getTenant('non-existent');

      expect(tenant).toBeNull();
    });
  });

  describe('getTenantByDomain', () => {
    it('should retrieve a tenant by domain', async () => {
      const mockTenant = {
        tenantId: 'tenant-123',
        name: 'Test Corp',
        domain: 'test.com',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
        settings: {},
      };

      mockRedisClient.get
        .mockResolvedValueOnce('tenant-123') // First call for domain lookup
        .mockResolvedValueOnce(JSON.stringify(mockTenant)); // Second call for tenant data

      const tenant = await tenantService.getTenantByDomain('test.com');

      expect(mockRedisClient.get).toHaveBeenCalledWith('tenant:domain:test.com');
      expect(tenant).toEqual(mockTenant);
    });

    it('should return null if domain does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const tenant = await tenantService.getTenantByDomain('non-existent.com');

      expect(tenant).toBeNull();
    });
  });

  describe('updateTenant', () => {
    it('should update an existing tenant', async () => {
      const existingTenant = {
        tenantId: 'tenant-123',
        name: 'Old Name',
        domain: 'test.com',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
        settings: {},
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(existingTenant));

      const updates = { name: 'New Name' };
      const updated = await tenantService.updateTenant('tenant-123', updates);

      expect(updated?.name).toBe('New Name');
      expect(updated?.updatedAt).toBeDefined();
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'tenant:tenant-123',
        expect.any(String)
      );
    });

    it('should return null if tenant does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const updated = await tenantService.updateTenant('non-existent', { name: 'New' });

      expect(updated).toBeNull();
    });
  });

  describe('createUser', () => {
    it('should create a new user', async () => {
      const userData: CreateUserData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        role: 'user',
      };

      const user = await tenantService.createUser('tenant-123', userData);

      expect(user).toEqual({
        userId: 'mock-uuid-1234',
        tenantId: 'tenant-123',
        username: 'testuser',
        email: 'test@example.com',
        role: 'user',
        status: 'active',
        createdAt: expect.any(String),
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'tenant:tenant-123:user:mock-uuid-1234',
        expect.any(String)
      );
      expect(mockRedisClient.sAdd).toHaveBeenCalledWith(
        'tenant:tenant-123:users',
        'mock-uuid-1234'
      );
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'tenant:tenant-123:user:email:test@example.com',
        'mock-uuid-1234'
      );
    });

    it('should not return password in the response', async () => {
      const userData: CreateUserData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      };

      const user = await tenantService.createUser('tenant-123', userData);

      expect(user).not.toHaveProperty('password');
    });

    it('should default role to user if not specified', async () => {
      const userData: CreateUserData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      };

      const user = await tenantService.createUser('tenant-123', userData);

      expect(user.role).toBe('user');
    });
  });

  describe('getUserByEmail', () => {
    it('should retrieve a user by email', async () => {
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

      mockRedisClient.get
        .mockResolvedValueOnce('user-123') // Email lookup
        .mockResolvedValueOnce(JSON.stringify(mockUser)); // User data

      const user = await tenantService.getUserByEmail('tenant-123', 'test@example.com');

      expect(user).toEqual(mockUser);
      expect(mockRedisClient.get).toHaveBeenCalledWith(
        'tenant:tenant-123:user:email:test@example.com'
      );
    });

    it('should return null if user does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const user = await tenantService.getUserByEmail('tenant-123', 'nonexistent@example.com');

      expect(user).toBeNull();
    });
  });

  describe('getUser', () => {
    it('should retrieve a user without password', async () => {
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

      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockUser));

      const user = await tenantService.getUser('tenant-123', 'user-123');

      expect(user).not.toHaveProperty('password');
      expect(user?.userId).toBe('user-123');
    });

    it('should return null if user does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const user = await tenantService.getUser('tenant-123', 'non-existent');

      expect(user).toBeNull();
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await tenantService.verifyPassword('password', 'hashed-password');

      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith('password', 'hashed-password');
    });

    it('should reject incorrect password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await tenantService.verifyPassword('wrong', 'hashed-password');

      expect(result).toBe(false);
    });
  });

  describe('getAllUsers', () => {
    it('should retrieve all users for a tenant', async () => {
      const mockUser1 = {
        userId: 'user-1',
        tenantId: 'tenant-123',
        username: 'user1',
        email: 'user1@example.com',
        role: 'user',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const mockUser2 = {
        userId: 'user-2',
        tenantId: 'tenant-123',
        username: 'user2',
        email: 'user2@example.com',
        role: 'admin',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      mockRedisClient.sMembers.mockResolvedValue(['user-1', 'user-2']);
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify({ ...mockUser1, password: 'hash1' }))
        .mockResolvedValueOnce(JSON.stringify({ ...mockUser2, password: 'hash2' }));

      const users = await tenantService.getAllUsers('tenant-123');

      expect(users).toHaveLength(2);
      expect(users[0]).not.toHaveProperty('password');
      expect(users[1]).not.toHaveProperty('password');
    });

    it('should return empty array if no users exist', async () => {
      mockRedisClient.sMembers.mockResolvedValue([]);

      const users = await tenantService.getAllUsers('tenant-123');

      expect(users).toEqual([]);
    });
  });

  describe('updateUser', () => {
    it('should update a user', async () => {
      const existingUser: User = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        username: 'oldname',
        email: 'old@example.com',
        password: 'hashed',
        role: 'user',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(existingUser));

      const updates = { username: 'newname' };
      const updated = await tenantService.updateUser('tenant-123', 'user-123', updates);

      expect(updated?.username).toBe('newname');
      expect(updated?.updatedAt).toBeDefined();
      expect(updated).not.toHaveProperty('password');
    });

    it('should return null if user does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const updated = await tenantService.updateUser('tenant-123', 'non-existent', {
        username: 'new',
      });

      expect(updated).toBeNull();
    });
  });

  describe('blacklistToken', () => {
    it('should blacklist a token with default expiry', async () => {
      await tenantService.blacklistToken('test-token');

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'token:blacklist:test-token',
        14400,
        'true'
      );
    });

    it('should blacklist a token with custom expiry', async () => {
      await tenantService.blacklistToken('test-token', 3600);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'token:blacklist:test-token',
        3600,
        'true'
      );
    });
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const session = await tenantService.createSession('tenant-123', 'user-123', {
        loginTime: '2024-01-01T00:00:00.000Z',
        userAgent: 'Mozilla/5.0',
      });

      expect(session).toEqual({
        sessionId: 'mock-uuid-1234',
        tenantId: 'tenant-123',
        userId: 'user-123',
        loginTime: '2024-01-01T00:00:00.000Z',
        userAgent: 'Mozilla/5.0',
        createdAt: expect.any(String),
      });

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'session:mock-uuid-1234',
        14400,
        expect.any(String)
      );
    });
  });

  describe('getSession', () => {
    it('should retrieve a session', async () => {
      const mockSession = {
        sessionId: 'session-123',
        tenantId: 'tenant-123',
        userId: 'user-123',
        loginTime: '2024-01-01T00:00:00.000Z',
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockSession));

      const session = await tenantService.getSession('session-123');

      expect(session).toEqual(mockSession);
    });

    it('should return null if session does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const session = await tenantService.getSession('non-existent');

      expect(session).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('should delete a session', async () => {
      await tenantService.deleteSession('session-123');

      expect(mockRedisClient.del).toHaveBeenCalledWith('session:session-123');
    });
  });
});
