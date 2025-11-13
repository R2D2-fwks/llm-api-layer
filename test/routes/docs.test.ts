import { Server } from '@hapi/hapi';
import Inert from '@hapi/inert';
import Vision from '@hapi/vision';
import docsRoutes from '../../src/routes/docs';

describe('Documentation Routes', () => {
  let server: Server;

  beforeAll(async () => {
    server = new Server({
      port: 0,
      host: 'localhost'
    });

    await server.register([Inert, Vision]);
    server.route(docsRoutes);
    await server.initialize();
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('GET /api-docs/openapi.yml', () => {
    it('should return the OpenAPI YAML file', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api-docs/openapi.yml'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/yaml');
      expect(response.payload).toContain('openapi: 3.0.3');
      expect(response.payload).toContain('LLM API Layer');
    });
  });

  describe('GET /api-docs', () => {
    it('should return Swagger UI HTML page', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api-docs'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.payload).toContain('swagger-ui');
      expect(response.payload).toContain('SwaggerUIBundle');
      expect(response.payload).toContain('/api-docs/openapi.yml');
    });

    it('should include Swagger UI CSS and JS from CDN', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api-docs'
      });

      expect(response.payload).toContain('swagger-ui-dist');
      expect(response.payload).toContain('swagger-ui.css');
      expect(response.payload).toContain('swagger-ui-bundle.js');
    });
  });

  describe('GET /docs', () => {
    it('should redirect to /api-docs', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/docs'
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/api-docs');
    });

    it('should redirect and return Swagger UI when following redirect', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/docs',
        allowInternals: true
      });

      // First request redirects
      expect(response.statusCode).toBe(302);

      // Follow the redirect
      const finalResponse = await server.inject({
        method: 'GET',
        url: response.headers.location as string
      });

      expect(finalResponse.statusCode).toBe(200);
      expect(finalResponse.payload).toContain('swagger-ui');
    });
  });
});
