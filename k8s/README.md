# LLM API Layer - Kubernetes Deployment Guide

## Prerequisites

- Docker installed
- Kubernetes cluster (minikube, kind, EKS, GKE, AKS, etc.)
- kubectl configured
- Helm (optional, for some deployments)

## Quick Start

### 1. Build Docker Image

```bash
# Build the image
docker build -t llm-api-layer:latest .

# Test locally with Docker Compose
docker-compose up -d
```

### 2. Deploy to Kubernetes

#### Option A: Using the deployment script
```bash
cd k8s
./deploy.sh [tag] [registry]

# Examples:
./deploy.sh latest                           # Deploy with latest tag
./deploy.sh v1.0.0                          # Deploy with specific version
./deploy.sh latest your-registry.com/       # Deploy to custom registry
```

#### Option B: Manual deployment
```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Create ConfigMap and Secret
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml

# Deploy Redis
kubectl apply -f k8s/redis.yaml

# Wait for Redis
kubectl wait --for=condition=ready pod -l app=redis -n llm-api-layer --timeout=120s

# Deploy application
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# Apply HPA and PDB
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/pdb.yaml

# Apply resource limits
kubectl apply -f k8s/resource-quota.yaml

# Optional: Apply Ingress
kubectl apply -f k8s/ingress.yaml
```

### 3. Verify Deployment

```bash
# Check pods
kubectl get pods -n llm-api-layer

# Check services
kubectl get svc -n llm-api-layer

# Check deployment status
kubectl rollout status deployment/llm-api-layer -n llm-api-layer

# View logs
kubectl logs -f -n llm-api-layer -l app=llm-api-layer
```

### 4. Access the Application

#### Port Forward (for testing)
```bash
kubectl port-forward -n llm-api-layer svc/llm-api-layer-service 8080:80
```

Then access: http://localhost:8080

#### Using Ingress (production)
Update `k8s/ingress.yaml` with your domain and apply:
```bash
kubectl apply -f k8s/ingress.yaml
```

## Kubernetes Resources

### Namespace
- **File**: `namespace.yaml`
- Isolates resources in `llm-api-layer` namespace

### ConfigMap
- **File**: `configmap.yaml`
- Non-sensitive configuration (NODE_ENV, PORT, LOG_LEVEL, etc.)

### Secret
- **File**: `secret.yaml`
- Sensitive data (JWT_SECRET, REDIS_URL)
- **⚠️ Important**: Update JWT_SECRET before production deployment

### Redis
- **File**: `redis.yaml`
- Includes: PVC, Service, Deployment
- 5Gi persistent storage
- Health checks configured

### Application Deployment
- **File**: `deployment.yaml`
- 3 replicas with rolling updates
- Init container waits for Redis
- Resource limits: 256Mi-512Mi memory, 200m-1000m CPU
- Liveness, readiness, and startup probes
- Runs as non-root user (UID 1001)

### Service
- **File**: `service.yaml`
- ClusterIP service exposing port 80
- Session affinity enabled

### Ingress
- **File**: `ingress.yaml`
- NGINX ingress controller
- TLS/SSL support with cert-manager
- Update domain before applying

### Horizontal Pod Autoscaler (HPA)
- **File**: `hpa.yaml`
- Auto-scales between 3-10 replicas
- Based on CPU (70%) and memory (80%)
- Scale down: stabilization 5min
- Scale up: immediate

### Pod Disruption Budget (PDB)
- **File**: `pdb.yaml`
- Ensures minimum 2 pods available during disruptions

### Resource Quota
- **File**: `resource-quota.yaml`
- Limits namespace resources
- Prevents resource exhaustion

## Environment Variables

Update in `k8s/configmap.yaml`:
- `NODE_ENV`: Environment (production/development)
- `PORT`: Application port (default: 3000)
- `HOST`: Bind host (0.0.0.0 for containers)
- `LOG_LEVEL`: Logging level (info/debug/warn/error)

Update in `k8s/secret.yaml`:
- `JWT_SECRET`: **Must change in production**
- `REDIS_URL`: Redis connection URL

## Monitoring & Debugging

### View Logs
```bash
# All pods
kubectl logs -f -n llm-api-layer -l app=llm-api-layer

# Specific pod
kubectl logs -f -n llm-api-layer <pod-name>

# Previous crashed pod
kubectl logs -n llm-api-layer <pod-name> --previous
```

### Describe Resources
```bash
kubectl describe pod <pod-name> -n llm-api-layer
kubectl describe deployment llm-api-layer -n llm-api-layer
kubectl describe hpa llm-api-layer-hpa -n llm-api-layer
```

### Execute Commands in Pod
```bash
kubectl exec -it -n llm-api-layer <pod-name> -- sh
```

### Check Events
```bash
kubectl get events -n llm-api-layer --sort-by='.lastTimestamp'
```

## Scaling

### Manual Scaling
```bash
kubectl scale deployment llm-api-layer --replicas=5 -n llm-api-layer
```

### View HPA Status
```bash
kubectl get hpa -n llm-api-layer
kubectl describe hpa llm-api-layer-hpa -n llm-api-layer
```

## Updates & Rollbacks

### Rolling Update
```bash
# Update image
kubectl set image deployment/llm-api-layer llm-api-layer=llm-api-layer:v2.0.0 -n llm-api-layer

# Check rollout status
kubectl rollout status deployment/llm-api-layer -n llm-api-layer
```

### Rollback
```bash
# Rollback to previous version
kubectl rollout undo deployment/llm-api-layer -n llm-api-layer

# Rollback to specific revision
kubectl rollout undo deployment/llm-api-layer --to-revision=2 -n llm-api-layer

# View rollout history
kubectl rollout history deployment/llm-api-layer -n llm-api-layer
```

## Cleanup

```bash
# Delete all resources
kubectl delete namespace llm-api-layer

# Or delete individual resources
kubectl delete -f k8s/
```

## Production Checklist

- [ ] Update JWT_SECRET in `secret.yaml`
- [ ] Configure proper domain in `ingress.yaml`
- [ ] Set up TLS certificates (cert-manager or manual)
- [ ] Adjust resource limits based on load testing
- [ ] Configure persistent storage class for Redis
- [ ] Set up monitoring (Prometheus/Grafana)
- [ ] Configure logging aggregation (ELK/Loki)
- [ ] Set up backup strategy for Redis data
- [ ] Configure network policies for security
- [ ] Set up alerts for critical metrics
- [ ] Review and adjust HPA thresholds
- [ ] Configure RBAC permissions
- [ ] Enable Pod Security Standards

## Load Testing

```bash
# Install k6 or apache bench

# Basic load test
kubectl port-forward -n llm-api-layer svc/llm-api-layer-service 8080:80
ab -n 10000 -c 100 http://localhost:8080/health
```

## CI/CD Integration

The deployment can be integrated with:
- GitHub Actions
- GitLab CI
- Jenkins
- ArgoCD
- Flux

Example GitHub Actions workflow:
```yaml
- name: Deploy to Kubernetes
  run: |
    cd k8s
    ./deploy.sh ${{ github.sha }} ${{ secrets.REGISTRY }}/
```

## Security Best Practices

1. Run as non-root user ✓ (configured)
2. Use read-only root filesystem (optional)
3. Drop all capabilities ✓ (configured)
4. Use network policies
5. Scan images for vulnerabilities
6. Rotate secrets regularly
7. Use RBAC for access control
8. Enable audit logging
9. Use Pod Security Standards

## Troubleshooting

### Pod not starting
```bash
kubectl describe pod <pod-name> -n llm-api-layer
kubectl logs <pod-name> -n llm-api-layer
```

### Redis connection issues
```bash
kubectl exec -it -n llm-api-layer <app-pod> -- sh
nc -zv redis-service 6379
```

### Resource limits issues
```bash
kubectl top pods -n llm-api-layer
kubectl describe hpa llm-api-layer-hpa -n llm-api-layer
```

## Support

For issues or questions:
- Check logs: `kubectl logs -f -n llm-api-layer -l app=llm-api-layer`
- Check events: `kubectl get events -n llm-api-layer`
- Review deployment: `kubectl describe deployment llm-api-layer -n llm-api-layer`
