# Architecture Documentation

## System Architecture

### Overview
The LLM API Layer is a multi-tenant, cloud-native application designed for scalability, security, and high availability.

```
┌─────────────────────────────────────────────────────────────┐
│                      Load Balancer / Ingress                │
│                    (nginx-ingress / ALB)                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Kubernetes Service                         │
│                  (llm-api-layer-service)                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
    ┌──────┐      ┌──────┐      ┌──────┐
    │ Pod1 │      │ Pod2 │      │ Pod3 │  (Auto-scaled 3-10 replicas)
    └──┬───┘      └──┬───┘      └──┬───┘
       │             │             │
       └─────────────┼─────────────┘
                     │
                     ▼
            ┌────────────────┐
            │  Redis Service │
            │   (Datastore)  │
            └────────────────┘
                     │
                     ▼
            ┌────────────────┐
            │     Redis      │
            │ Persistent Vol │
            └────────────────┘
```

## Components

### 1. Application Layer (Hapi.js + TypeScript)

**Responsibilities:**
- HTTP request handling
- JWT authentication & authorization
- Multi-tenant data isolation
- Business logic
- Request validation
- Session management

**Key Modules:**
- `server.ts` - Main server initialization
- `routes/` - API endpoint definitions
- `services/` - Business logic (TenantService)
- `plugins/` - Auth plugin, JWT validation
- `config/` - Logger, Redis client

### 2. Data Layer (Redis)

**Responsibilities:**
- Tenant data storage
- User credentials storage
- Session management
- Token blacklist
- Cache

**Data Structure:**
```
tenant:{tenantId}                    -> Tenant object
tenant:domain:{domain}               -> Tenant ID lookup
tenant:{tenantId}:user:{userId}      -> User object
tenant:{tenantId}:user:email:{email} -> User ID lookup
tenant:{tenantId}:users              -> Set of user IDs
token:blacklist:{token}              -> Blacklisted tokens
session:{sessionId}                  -> Session data
```

### 3. Authentication & Authorization

**Flow:**
```
1. User Login
   ├─> Validate credentials
   ├─> Generate JWT token
   ├─> Create session
   └─> Return token

2. Authenticated Request
   ├─> Extract JWT from header
   ├─> Validate token signature
   ├─> Check token blacklist
   ├─> Verify tenant & user exist
   ├─> Check user permissions (RBAC)
   └─> Process request

3. User Logout
   ├─> Extract token
   ├─> Add to blacklist
   └─> Delete session
```

## Kubernetes Architecture

### Pod Architecture

```
┌─────────────────────────────────────────────┐
│              Application Pod                 │
│                                              │
│  ┌────────────────────────────────────┐    │
│  │      Init Container                 │    │
│  │   (Wait for Redis)                  │    │
│  └────────────────────────────────────┘    │
│                    │                         │
│                    ▼                         │
│  ┌────────────────────────────────────┐    │
│  │      Main Container                 │    │
│  │   Node.js 20 Alpine                 │    │
│  │   ├─ Hapi.js Server                 │    │
│  │   ├─ Pino Logger                    │    │
│  │   └─ Health Checks                  │    │
│  │      - Liveness  (30s)              │    │
│  │      - Readiness (10s)              │    │
│  │      - Startup   (5s)               │    │
│  └────────────────────────────────────┘    │
│                                              │
│  Resources:                                  │
│  ├─ Requests: 200m CPU, 256Mi RAM           │
│  └─ Limits:   1000m CPU, 512Mi RAM          │
│                                              │
│  Security:                                   │
│  ├─ Non-root user (UID 1001)                │
│  ├─ Drop all capabilities                   │
│  └─ Read-only root filesystem               │
└─────────────────────────────────────────────┘
```

### Scaling Strategy

**Horizontal Pod Autoscaler (HPA):**
- Min replicas: 3
- Max replicas: 10
- CPU threshold: 70%
- Memory threshold: 80%
- Scale up: Immediate (max 4 pods/30s)
- Scale down: Stable 5min (max 50%/60s)

**Pod Disruption Budget (PDB):**
- Minimum available: 2 pods
- Ensures availability during:
  - Node maintenance
  - Rolling updates
  - Cluster upgrades

### Resource Management

**Namespace Resources:**
```yaml
Namespace Quota:
  CPU Requests:    10 cores
  CPU Limits:      20 cores
  Memory Requests: 10Gi
  Memory Limits:   20Gi
  PVCs:            5
  Load Balancers:  2
```

**Container Limits:**
```yaml
Per Container:
  CPU:    100m - 2 cores
  Memory: 64Mi - 2Gi

Default:
  CPU Request:    100m
  CPU Limit:      500m
  Memory Request: 128Mi
  Memory Limit:   512Mi
```

## Multi-Tenant Data Isolation

### Tenant Isolation Strategy

1. **Namespace Isolation**
   - Each tenant's data keyed by tenantId
   - Redis key prefixing: `tenant:{tenantId}:*`

2. **Authentication Scope**
   - JWT tokens include tenantId
   - All requests validated against tenant context
   - Users can only access their tenant's data

3. **Data Access Pattern**
   ```typescript
   // All operations scoped to tenant
   tenantService.getUser(tenantId, userId)
   tenantService.createUser(tenantId, userData)
   tenantService.getAllUsers(tenantId)
   ```

## Security Architecture

### Defense in Depth

**Layer 1: Network**
- Ingress with TLS/SSL
- Network policies (optional)
- Private Redis service (ClusterIP)

**Layer 2: Authentication**
- JWT with HS256
- Token expiration (4 hours)
- Token blacklist on logout
- Password hashing (bcrypt, rounds=10)

**Layer 3: Authorization**
- Role-based access control (admin, user)
- Scope-based permissions
- Tenant isolation

**Layer 4: Container**
- Non-root user (UID 1001)
- Dropped capabilities
- Read-only root filesystem
- Security context constraints

**Layer 5: Application**
- Input validation (Joi)
- Error handling
- Structured logging (no secrets)
- Rate limiting (future)

## Deployment Strategies

### Rolling Update
```yaml
Strategy:
  Type: RollingUpdate
  MaxSurge: 1        # Max 1 extra pod during update
  MaxUnavailable: 1  # Max 1 pod unavailable during update
```

**Process:**
1. Create 1 new pod (v2)
2. Wait for readiness
3. Terminate 1 old pod (v1)
4. Repeat until all updated

### Blue-Green Deployment
```bash
# Deploy green version
kubectl apply -f deployment-green.yaml

# Test green version
kubectl port-forward ...

# Switch service to green
kubectl patch service ... --type='json' -p='[{"op": "replace", "path": "/spec/selector/version", "value":"green"}]'

# Delete blue version
kubectl delete -f deployment-blue.yaml
```

### Canary Deployment
```bash
# Deploy canary (10% traffic)
kubectl apply -f deployment-canary.yaml
kubectl scale deployment/canary --replicas=1

# Monitor metrics
# If good, scale up canary, scale down stable
# If bad, delete canary
```

## Monitoring & Observability

### Health Checks

**Liveness Probe**
- Endpoint: `/health`
- Initial delay: 30s
- Period: 10s
- Failure threshold: 3
- Action: Restart pod

**Readiness Probe**
- Endpoint: `/health`
- Initial delay: 10s
- Period: 5s
- Failure threshold: 3
- Action: Remove from service

**Startup Probe**
- Endpoint: `/health`
- Initial delay: 0s
- Period: 5s
- Failure threshold: 30
- Action: Allow 150s startup time

### Logging

**Log Levels:**
- `debug`: Detailed debugging (token validation, queries)
- `info`: Important events (user creation, login)
- `warn`: Warning conditions (not found, invalid)
- `error`: Error conditions (failures, exceptions)

**Log Format:**
```json
{
  "level": 30,
  "time": "2024-01-01T00:00:00.000Z",
  "module": "AuthRoutes",
  "tenantId": "uuid",
  "userId": "uuid",
  "msg": "Login successful"
}
```

### Metrics (Future)

Recommended metrics to expose:
- Request count by endpoint
- Request duration by endpoint
- Error rate by type
- Active tenants
- Active sessions
- Redis connection pool stats
- Memory usage
- CPU usage

## Disaster Recovery

### Backup Strategy

**Redis Data:**
```bash
# Snapshot
kubectl exec -n llm-api-layer redis-pod -- redis-cli BGSAVE

# Copy snapshot
kubectl cp llm-api-layer/redis-pod:/data/dump.rdb ./backup/
```

**Restore:**
```bash
# Copy backup to pod
kubectl cp ./backup/dump.rdb llm-api-layer/redis-pod:/data/

# Restart Redis
kubectl rollout restart deployment/redis -n llm-api-layer
```

### High Availability

**Requirements:**
- Minimum 2 pods always available (PDB)
- Redis persistence enabled
- Regular backups
- Multi-zone deployment (recommended)
- Load balancer health checks

## Performance Optimization

### Application Level
- Connection pooling (Redis)
- Response compression (gzip)
- Request validation caching
- Token validation caching (future)

### Kubernetes Level
- HPA for auto-scaling
- Resource limits prevent OOM
- Pod anti-affinity (multi-node)
- Node affinity (zone spreading)

### Redis Level
- Persistence: RDB snapshots
- Eviction policy: allkeys-lru
- Max memory: 512MB
- Connection pooling

## CI/CD Pipeline

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│   Code   │────▶│   Test   │────▶│  Build   │────▶│  Deploy  │
│  Commit  │     │   Suite  │     │  Docker  │     │   K8s    │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                       │                  │
                       ▼                  ▼
                 ┌──────────┐      ┌──────────┐
                 │ Coverage │      │ Security │
                 │  Report  │      │   Scan   │
                 └──────────┘      └──────────┘
```

**Stages:**
1. **Test**: Unit tests, integration tests
2. **Build**: Docker image with multi-arch support
3. **Scan**: Security vulnerability scanning (Trivy)
4. **Push**: Push to container registry
5. **Deploy**: Update K8s deployment
6. **Verify**: Health checks and smoke tests

## Future Enhancements

### Short Term
- [ ] Rate limiting middleware
- [ ] Request/response caching
- [ ] Prometheus metrics
- [ ] Grafana dashboards
- [ ] ELK/Loki log aggregation

### Medium Term
- [ ] Redis Sentinel for HA
- [ ] PostgreSQL for relational data
- [ ] Message queue (RabbitMQ/Kafka)
- [ ] WebSocket support
- [ ] GraphQL API

### Long Term
- [ ] Service mesh (Istio)
- [ ] Distributed tracing (Jaeger)
- [ ] Multi-region deployment
- [ ] Edge caching (CDN)
- [ ] Machine learning features
