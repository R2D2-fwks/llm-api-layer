import { createClient, RedisClientType } from 'redis';

// Mock redis module
jest.mock('redis', () => ({
  createClient: jest.fn(),
}));

describe('RedisClient', () => {
  let redisClient: any;
  let mockRedisClient: Partial<RedisClientType>;

  beforeEach(() => {
    // Clear module cache to get a fresh instance
    jest.clearAllMocks();
    jest.resetModules();

    // Create mock Redis client
    mockRedisClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      ping: jest.fn().mockResolvedValue('PONG'),
    };

    (createClient as jest.Mock).mockReturnValue(mockRedisClient);

    // Import after mocking
    redisClient = require('../src/config/redis').default;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connect', () => {
    it('should successfully connect to Redis', async () => {
      await redisClient.connect();

      expect(createClient).toHaveBeenCalledWith({
        url: 'redis://localhost:6379',
        socket: {
          reconnectStrategy: expect.any(Function),
        },
      });
      expect(mockRedisClient.connect).toHaveBeenCalled();
    });

    it('should use REDIS_URL from environment if provided', async () => {
      process.env.REDIS_URL = 'redis://custom:6380';
      
      // Re-import to pick up new env var
      jest.resetModules();
      redisClient = require('../src/config/redis').default;
      (createClient as jest.Mock).mockReturnValue(mockRedisClient);

      await redisClient.connect();

      expect(createClient).toHaveBeenCalledWith({
        url: 'redis://custom:6380',
        socket: {
          reconnectStrategy: expect.any(Function),
        },
      });

      delete process.env.REDIS_URL;
    });

    it('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      mockRedisClient.connect = jest.fn().mockRejectedValue(error);
      (createClient as jest.Mock).mockReturnValue(mockRedisClient);

      await expect(redisClient.connect()).rejects.toThrow('Connection failed');
    });

    it('should set up error event listener', async () => {
      await redisClient.connect();

      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should set up connect event listener', async () => {
      await redisClient.connect();

      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    it('should implement reconnect strategy', async () => {
      await redisClient.connect();

      const createClientCall = (createClient as jest.Mock).mock.calls[0][0];
      const reconnectStrategy = createClientCall.socket.reconnectStrategy;

      // Test reconnect with retries < 10
      expect(reconnectStrategy(5)).toBe(2500); // 5 * 500

      // Test reconnect with retries > 10
      const result = reconnectStrategy(11);
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe('Redis connection failed');
    });
  });

  describe('getClient', () => {
    it('should return the Redis client after connection', async () => {
      await redisClient.connect();
      const client = redisClient.getClient();

      expect(client).toBe(mockRedisClient);
    });

    it('should throw error if client is not initialized', () => {
      expect(() => redisClient.getClient()).toThrow(
        'Redis client not initialized. Call connect() first.'
      );
    });
  });

  describe('disconnect', () => {
    it('should disconnect from Redis', async () => {
      await redisClient.connect();
      await redisClient.disconnect();

      expect(mockRedisClient.quit).toHaveBeenCalled();
    });

    it('should not throw if client is not initialized', async () => {
      await expect(redisClient.disconnect()).resolves.not.toThrow();
    });
  });
});
