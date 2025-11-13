import { createClient, RedisClientType } from 'redis';
import { Logger } from 'pino';
import logger from './logger';

class RedisClient {
  private client: RedisClientType | null = null;
  private logger: Logger;

  constructor(loggerInstance: Logger = logger) {
    this.logger = loggerInstance.child({ module: 'RedisClient' });
  }

  async connect(): Promise<RedisClientType> {
    try {
      this.client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          reconnectStrategy: (retries: number) => {
            if (retries > 10) {
              this.logger.error({ retries }, 'Redis reconnection attempts exceeded');
              return new Error('Redis connection failed');
            }
            this.logger.warn({ retries }, 'Attempting Redis reconnection');
            return retries * 500;
          }
        }
      });

      (this.client as any).on('error', (err: Error) => {
        this.logger.error({ error: err.message }, 'Redis Client Error');
      });

      (this.client as any).on('connect', () => {
        this.logger.info('Redis Client Connected');
      });

      (this.client as any).on('ready', () => {
        this.logger.info('Redis Client Ready');
      });

      (this.client as any).on('reconnecting', () => {
        this.logger.warn('Redis Client Reconnecting');
      });

      await this.client.connect();
      this.logger.info({ url: process.env.REDIS_URL || 'redis://localhost:6379' }, 'Connected to Redis');
      return this.client;
    } catch (error) {
      this.logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to connect to Redis');
      throw error;
    }
  }

  getClient(): RedisClientType {
    if (!this.client) {
      this.logger.error('Redis client not initialized');
      throw new Error('Redis client not initialized. Call connect() first.');
    }
    return this.client;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.logger.info('Redis client disconnected');
    }
  }
}

export default new RedisClient();
