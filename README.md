# LLM API Layer - Multi-Tenant Hapi.js Server

A secure, multi-tenant API server built with Hapi.js framework and TypeScript, featuring JWT authentication and Redis for data persistence. Production-ready with Docker and Kubernetes support.

## Features

- 🔐 JWT-based authentication
- 🏢 Multi-tenant architecture
- 💾 Redis as datastore
- 👥 User management with role-based access control
- 🔑 Secure password hashing with bcrypt
- 🚀 RESTful API endpoints
- ✅ Request validation with Joi
- 🔄 Session management
- 🛡️ Token blacklisting for logout
- 📘 Full TypeScript support with strict type checking
- 📝 Structured logging with Pino
- 🐳 Docker containerization
- ☸️ Kubernetes deployment ready
- 📊 OpenAPI documentation (Swagger UI)
- 🔄 Auto-scaling with HPA
- 🛡️ Production-grade security
- 🤖 **LLM Integration** - Ollama API wrapper with tenant isolation

## Prerequisites

- Node.js (v18 or higher)
- Redis (v6 or higher)
- npm or yarn
- TypeScript knowledge (optional, for development)

## Installation

1. Clone the repository and navigate to the project directory

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file from the example:
```bash
cp .env.example .env
```

4. Update the `.env` file with your configuration:
```env
NODE_ENV=development
PORT=3000
HOST=localhost
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

5. Make sure Redis is running:
```bash
# On macOS with Homebrew
brew services start redis

# Or run Redis directly
redis-server
```

## Running the Server

### Local Development

#### Development mode (with auto-reload):
```bash
npm run dev
```

#### Build the project:
```bash
npm run build
```

#### Production mode:
```bash
npm run build
npm start
```

The server will start on `http://localhost:3000` (or the port specified in your `.env` file).

### Docker

#### Using Docker Compose (Recommended for local development):
```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

#### Using Docker directly:
```bash
# Build image
docker build -t llm-api-layer:latest .

# Run container
docker run -d \
  -p 3000:3000 \
  -e REDIS_URL=redis://your-redis-host:6379 \
  -e JWT_SECRET=your-secret \
  llm-api-layer:latest
```

### Kubernetes

#### Quick deploy:
```bash
cd k8s
./deploy.sh
```

#### Port forward to access locally:
```bash
kubectl port-forward -n llm-api-layer svc/llm-api-layer-service 8080:80
```

See [k8s/README.md](k8s/README.md) for detailed Kubernetes deployment instructions.

### Using Makefile

```bash
# Show all available commands
make help

# Quick start with Docker Compose
make up

# Deploy to Kubernetes
make k8s-deploy

# View Kubernetes logs
make k8s-logs

# Run tests
make test
```

## API Endpoints

### Public Endpoints (No Authentication Required)

#### Health Check
```http
GET /health
```
Returns server health status and Redis connection status.

#### Register Tenant
```http
POST /api/auth/register
Content-Type: application/json

{
  "tenantName": "Acme Corp",
  "domain": "acme.com",
  "username": "admin",
  "email": "admin@acme.com",
  "password": "SecurePass123"
}
```
Creates a new tenant with an admin user.

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@acme.com",
  "password": "SecurePass123",
  "domain": "acme.com"
}
```
Or login with tenantId:
```json
{
  "email": "admin@acme.com",
  "password": "SecurePass123",
  "tenantId": "uuid-here"
}
```

### Protected Endpoints (Authentication Required)

Include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

#### Get Current User
```http
GET /api/auth/me
```

#### Logout
```http
POST /api/auth/logout
```

#### Create User (Admin Only)
```http
POST /api/users
Content-Type: application/json

{
  "username": "newuser",
  "email": "user@acme.com",
  "password": "UserPass123",
  "role": "user"
}
```

#### List Users (Admin Only)
```http
GET /api/users
```

## Architecture

### Multi-Tenant Design

The application uses a multi-tenant architecture where:
- Each tenant has isolated data in Redis
- Users belong to specific tenants
- Authentication is scoped to tenant context
- All operations are tenant-aware

### Redis Data Structure

```
tenant:{tenantId}                              # Tenant information
tenant:domain:{domain}                         # Domain to tenant mapping
tenant:{tenantId}:user:{userId}               # User information
tenant:{tenantId}:user:email:{email}          # Email to userId mapping
tenant:{tenantId}:users                       # Set of user IDs for tenant
token:blacklist:{token}                       # Blacklisted tokens
session:{sessionId}                           # User sessions
tenants:all                                   # Set of all tenant IDs
```

### Security Features

1. **JWT Authentication**: Secure token-based authentication
2. **Password Hashing**: Bcrypt with salt rounds
3. **Token Blacklisting**: Logout invalidates tokens
4. **Role-Based Access Control**: Admin and user roles
5. **Tenant Isolation**: Complete data separation between tenants
6. **Input Validation**: Joi schema validation for all inputs

## Project Structure

```
llm-api-layer/
├── src/
│   ├── config/
│   │   └── redis.ts              # Redis client configuration
│   ├── plugins/
│   │   └── auth.ts               # Authentication plugin
│   ├── routes/
│   │   └── auth.ts               # Authentication routes
│   ├── services/
│   │   └── tenantService.ts      # Tenant and user management
│   ├── types/
│   │   └── index.ts              # TypeScript type definitions
│   └── server.ts                 # Main server file
├── dist/                         # Compiled JavaScript (generated)
├── .env.example                  # Environment variables template
├── .gitignore                    # Git ignore file
├── tsconfig.json                 # TypeScript configuration
├── package.json                  # Dependencies and scripts
└── README.md                     # This file
```

## Error Handling

The API returns consistent error responses:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed"
}
```

Common status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid credentials or token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `500` - Internal Server Error

## TypeScript Benefits

This project is fully typed with TypeScript, providing:

- **Type Safety**: Catch errors at compile time
- **Better IDE Support**: Enhanced autocomplete and intellisense
- **Self-Documenting Code**: Types serve as inline documentation
- **Refactoring Confidence**: Rename and refactor with confidence
- **Interface Definitions**: Clear contracts between modules

Key type definitions include:
- `Tenant`, `User`, `Session` interfaces
- `AuthCredentials` for JWT authentication
- `CreateUserData`, `RegisterPayload`, `LoginPayload` for API contracts

## Testing

The project includes comprehensive unit and integration tests using Jest.

### Run Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests with verbose output
npm run test:verbose
```

### Test Coverage
- **Redis Client**: Connection, error handling, reconnection strategy
- **Tenant Service**: CRUD operations, user management, sessions
- **Auth Plugin**: JWT validation, scope-based authorization
- **Auth Routes**: Registration, login, logout, user management
- **Server**: Health checks, error handling, CORS, validation

See [test/README.md](test/README.md) for detailed testing documentation.

## Development

### Testing the API

You can use curl, Postman, or any HTTP client:

```bash
# Register a tenant
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "Test Corp",
    "domain": "test.com",
    "username": "testadmin",
    "email": "admin@test.com",
    "password": "TestPass123"
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "TestPass123",
    "domain": "test.com"
  }'

# Get current user (use token from login response)
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## License

ISC

## Author

Kartikeya Sharma
