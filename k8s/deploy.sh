#!/bin/bash

# Build and Deploy LLM API Layer to Kubernetes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== LLM API Layer Kubernetes Deployment ===${NC}\n"

# Configuration
DOCKER_IMAGE="llm-api-layer"
DOCKER_TAG="${1:-latest}"
REGISTRY="${2:-}"  # Optional: your-registry.com/

# Full image name
if [ -n "$REGISTRY" ]; then
    FULL_IMAGE="${REGISTRY}${DOCKER_IMAGE}:${DOCKER_TAG}"
else
    FULL_IMAGE="${DOCKER_IMAGE}:${DOCKER_TAG}"
fi

echo -e "${YELLOW}Building Docker image: ${FULL_IMAGE}${NC}"

# Build Docker image
docker build -t "${FULL_IMAGE}" .

if [ $? -ne 0 ]; then
    echo -e "${RED}Docker build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker image built successfully${NC}\n"

# Push to registry if specified
if [ -n "$REGISTRY" ]; then
    echo -e "${YELLOW}Pushing to registry...${NC}"
    docker push "${FULL_IMAGE}"
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Docker push failed!${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Image pushed to registry${NC}\n"
fi

# Deploy to Kubernetes
echo -e "${YELLOW}Deploying to Kubernetes...${NC}\n"

# Create namespace
echo "Creating namespace..."
kubectl apply -f k8s/namespace.yaml

# Create ConfigMap and Secret
echo "Creating ConfigMap and Secret..."
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml

# Deploy Redis
echo "Deploying Redis..."
kubectl apply -f k8s/redis.yaml

# Wait for Redis to be ready
echo "Waiting for Redis to be ready..."
kubectl wait --for=condition=ready pod -l app=redis -n llm-api-layer --timeout=120s

# Update deployment image if using custom tag/registry
if [ "$DOCKER_TAG" != "latest" ] || [ -n "$REGISTRY" ]; then
    echo "Updating deployment image reference..."
    kubectl set image deployment/llm-api-layer llm-api-layer="${FULL_IMAGE}" -n llm-api-layer --record || true
fi

# Deploy application
echo "Deploying application..."
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# Apply HPA and PDB
echo "Applying HPA and PDB..."
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/pdb.yaml

# Apply resource quota
echo "Applying resource quota..."
kubectl apply -f k8s/resource-quota.yaml

# Optional: Apply Ingress (uncomment if needed)
# echo "Applying Ingress..."
# kubectl apply -f k8s/ingress.yaml

# Wait for deployment to be ready
echo -e "\n${YELLOW}Waiting for deployment to be ready...${NC}"
kubectl rollout status deployment/llm-api-layer -n llm-api-layer --timeout=5m

if [ $? -ne 0 ]; then
    echo -e "${RED}Deployment failed!${NC}"
    echo "Recent events:"
    kubectl get events -n llm-api-layer --sort-by='.lastTimestamp' | tail -20
    exit 1
fi

echo -e "\n${GREEN}=== Deployment Summary ===${NC}"
kubectl get all -n llm-api-layer

echo -e "\n${GREEN}=== Pod Status ===${NC}"
kubectl get pods -n llm-api-layer -o wide

echo -e "\n${GREEN}✓ Deployment completed successfully!${NC}"
echo -e "\nTo access the application:"
echo -e "  kubectl port-forward -n llm-api-layer svc/llm-api-layer-service 8080:80"
echo -e "  Then open: http://localhost:8080"
echo -e "\nTo view logs:"
echo -e "  kubectl logs -f -n llm-api-layer -l app=llm-api-layer"
echo -e "\nTo get service URL:"
echo -e "  kubectl get svc -n llm-api-layer llm-api-layer-service"
