import axios, { AxiosInstance } from 'axios';
import { Logger } from 'pino';
import logger from '../config/logger';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
  };
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

class OllamaService {
  private client: AxiosInstance;
  private logger: Logger;
  private ollamaUrl: string;

  constructor(loggerInstance: Logger = logger) {
    this.logger = loggerInstance.child({ module: 'OllamaService' });
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    
    this.client = axios.create({
      baseURL: this.ollamaUrl,
      timeout: 120000, // 2 minutes timeout for LLM responses
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.logger.info({ ollamaUrl: this.ollamaUrl }, 'OllamaService initialized');
  }

  async chat(request: OllamaChatRequest, tenantId: string): Promise<OllamaChatResponse> {
    this.logger.info({ 
      tenantId, 
      model: request.model, 
      messageCount: request.messages.length 
    }, 'Sending chat request to Ollama');

    try {
      const response = await this.client.post<OllamaChatResponse>('/api/chat', {
        ...request,
        stream: false // Force non-streaming for simplicity
      });

      this.logger.info({ 
        tenantId, 
        model: request.model,
        done: response.data.done,
        eval_count: response.data.eval_count
      }, 'Chat response received from Ollama');

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error({ 
          tenantId,
          error: error.message,
          status: error.response?.status,
          data: error.response?.data
        }, 'Ollama chat request failed');
        
        throw new Error(`Ollama request failed: ${error.message}`);
      }
      
      this.logger.error({ tenantId, error }, 'Unexpected error in Ollama chat');
      throw error;
    }
  }

  async streamChat(
    request: OllamaChatRequest, 
    tenantId: string,
    onChunk: (chunk: OllamaChatResponse) => void
  ): Promise<void> {
    this.logger.info({ 
      tenantId, 
      model: request.model, 
      messageCount: request.messages.length 
    }, 'Starting streaming chat with Ollama');

    try {
      const response = await this.client.post('/api/chat', {
        ...request,
        stream: true
      }, {
        responseType: 'stream'
      });

      const stream = response.data;

      return new Promise((resolve, reject) => {
        let buffer = '';

        stream.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line);
                onChunk(data);
              } catch (e) {
                this.logger.warn({ tenantId, line }, 'Failed to parse stream chunk');
              }
            }
          }
        });

        stream.on('end', () => {
          this.logger.info({ tenantId }, 'Streaming chat completed');
          resolve();
        });

        stream.on('error', (error: Error) => {
          this.logger.error({ tenantId, error: error.message }, 'Stream error');
          reject(error);
        });
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error({ 
          tenantId,
          error: error.message,
          status: error.response?.status
        }, 'Ollama streaming chat failed');
        
        throw new Error(`Ollama streaming request failed: ${error.message}`);
      }
      
      this.logger.error({ tenantId, error }, 'Unexpected error in streaming chat');
      throw error;
    }
  }

  async listModels(): Promise<{ models: Array<{ name: string; size: number; modified_at: string }> }> {
    this.logger.debug('Fetching available models from Ollama');

    try {
      const response = await this.client.get('/api/tags');
      
      this.logger.info({ 
        modelCount: response.data.models?.length || 0 
      }, 'Models fetched from Ollama');

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error({ 
          error: error.message,
          status: error.response?.status
        }, 'Failed to fetch models from Ollama');
        
        throw new Error(`Failed to fetch models: ${error.message}`);
      }
      
      this.logger.error({ error }, 'Unexpected error fetching models');
      throw error;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.client.get('/');
      return true;
    } catch (error) {
      this.logger.warn('Ollama health check failed');
      return false;
    }
  }
}

export default new OllamaService();
