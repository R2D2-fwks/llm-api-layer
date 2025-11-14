# LLM API Endpoints

This document describes the new LLM endpoints that wrap Ollama's API with tenant isolation.

## Prerequisites

1. **Ollama must be running** on your system:
   ```bash
   # Check if Ollama is running
   curl http://localhost:11434/api/tags
   
   # If not running, start Ollama
   ollama serve
   ```

2. **Pull a model** (if you haven't already):
   ```bash
   ollama pull llama2
   # or
   ollama pull mistral
   ```

## Authentication

All LLM endpoints (except health check) require:
- **JWT token** in the Authorization header: `Bearer <token>`
- **Tenant ID** in the `x-tenant-id` header

The tenant ID in the header must match the tenant ID associated with your JWT token.

## Endpoints

### 1. Chat with LLM

**POST** `/api/llm/chat`

Sends a chat message to the Ollama LLM with tenant isolation.

#### Headers
```
Authorization: Bearer <your-jwt-token>
x-tenant-id: <your-tenant-id>
Content-Type: application/json
```

#### Request Body
```json
{
  "model": "llama2",
  "messages": [
    {
      "role": "user",
      "content": "What is the capital of France?"
    }
  ],
  "stream": false
}
```

#### Response (200 OK)
```json
{
  "model": "llama2",
  "created_at": "2024-01-15T10:30:00Z",
  "message": {
    "role": "assistant",
    "content": "The capital of France is Paris."
  },
  "done": true,
  "total_duration": 5191566416,
  "load_duration": 2154458,
  "prompt_eval_count": 26,
  "prompt_eval_duration": 130079000,
  "eval_count": 259,
  "eval_duration": 5050432000,
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user123"
}
```

#### Example with curl
```bash
# First, register and get a token
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "My Company",
    "domain": "mycompany.com",
    "username": "admin",
    "email": "admin@mycompany.com",
    "password": "SecurePass123"
  }'

# Extract token and tenantId from response, then:
TOKEN="<your-token>"
TENANT_ID="<your-tenant-id>"

# Chat with LLM
curl -X POST http://localhost:3000/api/llm/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama2",
    "messages": [
      {
        "role": "user",
        "content": "What is the capital of France?"
      }
    ],
    "stream": false
  }'
```

### 2. List Available Models

**GET** `/api/llm/models`

Retrieves a list of all available models from Ollama.

#### Headers
```
Authorization: Bearer <your-jwt-token>
x-tenant-id: <your-tenant-id>
```

#### Response (200 OK)
```json
{
  "models": [
    {
      "name": "llama2",
      "modified_at": "2024-01-15T10:30:00Z",
      "size": 3826793677,
      "digest": "sha256:78e26419b4469263f75331927a00a0284ef6544c1975b826b15abdaef17bb962"
    },
    {
      "name": "mistral",
      "modified_at": "2024-01-14T09:20:00Z",
      "size": 4109865159,
      "digest": "sha256:..."
    }
  ],
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Example with curl
```bash
curl -X GET http://localhost:3000/api/llm/models \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID"
```

### 3. Health Check

**GET** `/api/llm/health`

Checks if the Ollama service is available and responding. This endpoint does not require authentication.

#### Response (200 OK)
```json
{
  "status": "healthy",
  "service": "ollama",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### Response (503 Service Unavailable)
```json
{
  "status": "unhealthy",
  "service": "ollama",
  "error": "Health check failed",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### Example with curl
```bash
curl -X GET http://localhost:3000/api/llm/health
```

## Error Responses

### 400 Bad Request
Invalid request data (validation failed).

### 401 Unauthorized
Missing or invalid JWT token.

### 403 Forbidden
Tenant ID in header doesn't match the tenant ID in the JWT token.

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Tenant ID mismatch"
}
```

### 502 Bad Gateway
Ollama service error (service not available or returned an error).

```json
{
  "statusCode": 502,
  "error": "Bad Gateway",
  "message": "Ollama service error: <error details>"
}
```

### 503 Service Unavailable
Ollama service is not responding (only for health check endpoint).

## Multi-Conversation Chat

To have a conversation with context, include previous messages:

```json
{
  "model": "llama2",
  "messages": [
    {
      "role": "user",
      "content": "What is the capital of France?"
    },
    {
      "role": "assistant",
      "content": "The capital of France is Paris."
    },
    {
      "role": "user",
      "content": "What is its population?"
    }
  ],
  "stream": false
}
```

## Configuration

The Ollama URL can be configured via environment variable:

```bash
OLLAMA_URL=http://localhost:11434
```

Default timeout for LLM requests is 2 minutes (120 seconds).

## Testing with Swagger UI

You can also test these endpoints using the Swagger UI:

1. Open http://localhost:3000/api-docs in your browser
2. First, use the `/api/auth/register` or `/api/auth/login` endpoint to get a token
3. Click the "Authorize" button at the top and enter your token: `Bearer <token>`
4. Test the LLM endpoints under the "LLM" section
5. Remember to add the `x-tenant-id` header in each request

## Tenant Isolation

The LLM endpoints enforce tenant isolation:
- Each request must include the tenant ID in the `x-tenant-id` header
- The API validates that the tenant ID matches the authenticated user's tenant
- Responses include the tenant ID and user ID for audit purposes
- This ensures that LLM interactions are properly isolated per tenant

## Streaming Support

Streaming support is planned but not yet implemented. Currently, all responses are non-streaming.
The `stream` parameter in the request is accepted but will always return a complete response.

## Logging

All LLM interactions are logged with structured JSON logs including:
- Tenant ID
- User ID
- Model used
- Request/response details
- Error information (if any)

Check the server logs for debugging and audit purposes.
