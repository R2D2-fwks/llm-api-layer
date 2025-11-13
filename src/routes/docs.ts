import { ServerRoute } from '@hapi/hapi';
import * as Path from 'path';

const docsRoutes: ServerRoute[] = [
  // Serve the OpenAPI YAML file
  {
    method: 'GET',
    path: '/api-docs/openapi.yml',
    options: {
      auth: false,
      description: 'OpenAPI specification file',
      tags: ['documentation']
    },
    handler: {
      file: {
        path: Path.join(__dirname, '../../api.yml'),
        confine: false
      }
    }
  },
  
  // Serve Swagger UI HTML page
  {
    method: 'GET',
    path: '/api-docs',
    options: {
      auth: false,
      description: 'API documentation UI',
      tags: ['documentation']
    },
    handler: (_request, h) => {
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LLM API Layer - API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.10.0/swagger-ui.css">
  <style>
    body {
      margin: 0;
      padding: 0;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.10.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.10.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: '/api-docs/openapi.yml',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        persistAuthorization: true,
        tryItOutEnabled: true
      });
    };
  </script>
</body>
</html>
      `;
      return h.response(html).type('text/html');
    }
  },
  
  // Redirect /docs to /api-docs for convenience
  {
    method: 'GET',
    path: '/docs',
    options: {
      auth: false,
      description: 'Redirect to API documentation',
      tags: ['documentation']
    },
    handler: (_request, h) => {
      return h.redirect('/api-docs');
    }
  }
];

export default docsRoutes;
