export interface Tenant {
  tenantId: string;
  name: string;
  domain: string;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
  updatedAt?: string;
  settings?: Record<string, any>;
}

export interface User {
  userId: string;
  tenantId: string;
  username: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt?: string;
}

export interface UserWithoutPassword extends Omit<User, 'password'> {}

export interface Session {
  sessionId: string;
  tenantId: string;
  userId: string;
  loginTime: string;
  userAgent?: string;
  createdAt: string;
}

export interface CreateTenantData {
  name: string;
  domain: string;
  settings?: Record<string, any>;
}

export interface CreateUserData {
  username: string;
  email: string;
  password: string;
  role?: 'admin' | 'user';
}

export interface UpdateTenantData {
  name?: string;
  domain?: string;
  status?: 'active' | 'inactive' | 'suspended';
  settings?: Record<string, any>;
}

export interface UpdateUserData {
  username?: string;
  email?: string;
  role?: 'admin' | 'user';
  status?: 'active' | 'inactive';
}

export interface JWTPayload {
  aud: string;
  iss: string;
  userId: string;
  tenantId: string;
  role: 'admin' | 'user';
}

export interface AuthCredentials {
  user: UserWithoutPassword;
  tenantId: string;
  scope: string[];
}

export interface RegisterPayload {
  tenantName: string;
  domain: string;
  username: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
  tenantId?: string;
  domain?: string;
}

// New interface for dependency injection
export interface ServiceDependencies {
  logger: import('pino').Logger;
}
