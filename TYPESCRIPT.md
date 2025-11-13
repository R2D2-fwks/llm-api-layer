# TypeScript Development Guide

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run in development mode**:
   ```bash
   npm run dev
   ```
   This uses `ts-node-dev` for hot-reloading without compilation.

3. **Build for production**:
   ```bash
   npm run build
   ```
   Compiles TypeScript to JavaScript in the `dist/` folder.

4. **Run production build**:
   ```bash
   npm start
   ```
   Runs the compiled JavaScript from `dist/`.

## TypeScript Configuration

The project uses strict TypeScript settings defined in `tsconfig.json`:

- **Target**: ES2020
- **Module**: CommonJS
- **Strict Mode**: Enabled (all strict checks)
- **Source Maps**: Generated for debugging
- **Declaration Files**: Generated for type definitions

## Type Definitions

All types are defined in `src/types/index.ts`:

### Core Interfaces
- `Tenant` - Tenant entity structure
- `User` - User entity with password
- `UserWithoutPassword` - User entity for API responses
- `Session` - User session data
- `AuthCredentials` - JWT authentication credentials
- `JWTPayload` - JWT token payload structure

### API Payloads
- `RegisterPayload` - Tenant registration request
- `LoginPayload` - User login request
- `CreateUserData` - User creation data
- `CreateTenantData` - Tenant creation data
- `UpdateUserData` - User update data
- `UpdateTenantData` - Tenant update data

## Common TypeScript Commands

```bash
# Clean build artifacts
npm run clean

# Build and clean in one command
npm run prebuild

# Watch mode - auto-compile on changes
npm run watch

# Development with hot reload
npm run dev
```

## Type Checking

TypeScript will check types during:
- Development (in IDE with TypeScript extension)
- Build time (`npm run build`)
- Development server (`npm run dev`)

All type errors must be resolved before production build succeeds.

## Working with Types

### Importing Types
```typescript
import { User, Tenant, AuthCredentials } from './types';
```

### Type Assertions
When working with Hapi.js, you may need type assertions:
```typescript
const credentials = request.auth.credentials as any as AuthCredentials;
const payload = request.payload as RegisterPayload;
```

### Optional Chaining
Use optional chaining for safer code:
```typescript
const userAgent = request.headers?.['user-agent'];
```

## IDE Setup

### VS Code (Recommended)
VS Code has built-in TypeScript support. Recommended extensions:
- ESLint
- TypeScript Hero
- Pretty TypeScript Errors

### IntelliJ/WebStorm
TypeScript support is built-in. No additional setup required.

## Troubleshooting

### "Cannot find name 'process'" or similar Node.js errors
- Ensure `@types/node` is installed: `npm install --save-dev @types/node`
- Check `tsconfig.json` includes `"types": ["node"]`

### Module resolution errors
- Delete `node_modules` and `package-lock.json`
- Run `npm install` again

### Build errors about missing types
- Install missing type definitions: `npm install --save-dev @types/<package-name>`

### Development server not reloading
- Kill the process and restart: `npm run dev`
- Check for syntax errors in your TypeScript files

## Production Deployment

1. Build the project: `npm run build`
2. Set environment variables (copy from `.env.example`)
3. Ensure Redis is running
4. Start the server: `npm start`

The compiled JavaScript in `dist/` folder is what runs in production.
