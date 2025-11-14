.PHONY: help build run test clean docker-build docker-run docker-clean k8s-deploy k8s-delete k8s-logs k8s-status

# Variables
DOCKER_IMAGE := llm-api-layer
DOCKER_TAG := latest
NAMESPACE := llm-api-layer

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# Development targets
install: ## Install dependencies
	npm install

build: ## Build TypeScript
	npm run build

dev: ## Run in development mode
	npm run dev

test: ## Run tests
	npm test

test-watch: ## Run tests in watch mode
	npm run test:watch

test-coverage: ## Run tests with coverage
	npm run test:coverage

clean: ## Clean build artifacts
	npm run clean

# Docker targets
docker-build: ## Build Docker image
	docker build -t $(DOCKER_IMAGE):$(DOCKER_TAG) .

docker-run: ## Run Docker container locally
	docker run -d \
		--name llm-api-layer \
		-p 3000:3000 \
		-e NODE_ENV=production \
		-e REDIS_URL=redis://host.docker.internal:6379 \
		-e JWT_SECRET=dev-secret-change-me \
		$(DOCKER_IMAGE):$(DOCKER_TAG)

docker-logs: ## View Docker container logs
	docker logs -f llm-api-layer

docker-stop: ## Stop Docker container
	docker stop llm-api-layer || true
	docker rm llm-api-layer || true

docker-clean: docker-stop ## Clean Docker resources
	docker rmi $(DOCKER_IMAGE):$(DOCKER_TAG) || true

docker-compose-up: ## Start with Docker Compose
	docker-compose up -d

docker-compose-down: ## Stop Docker Compose
	docker-compose down -v

docker-compose-logs: ## View Docker Compose logs
	docker-compose logs -f

# Kubernetes targets
k8s-build-deploy: docker-build k8s-deploy ## Build and deploy to Kubernetes

k8s-deploy: ## Deploy to Kubernetes
	cd k8s && ./deploy.sh $(DOCKER_TAG)

k8s-delete: ## Delete Kubernetes resources
	kubectl delete namespace $(NAMESPACE) || true

k8s-status: ## Check Kubernetes deployment status
	@echo "=== Namespace ==="
	kubectl get namespace $(NAMESPACE)
	@echo "\n=== Pods ==="
	kubectl get pods -n $(NAMESPACE) -o wide
	@echo "\n=== Services ==="
	kubectl get svc -n $(NAMESPACE)
	@echo "\n=== Deployments ==="
	kubectl get deployments -n $(NAMESPACE)
	@echo "\n=== HPA ==="
	kubectl get hpa -n $(NAMESPACE)

k8s-logs: ## View Kubernetes logs
	kubectl logs -f -n $(NAMESPACE) -l app=llm-api-layer

k8s-logs-redis: ## View Redis logs
	kubectl logs -f -n $(NAMESPACE) -l app=redis

k8s-describe: ## Describe Kubernetes deployment
	kubectl describe deployment llm-api-layer -n $(NAMESPACE)

k8s-pods: ## List Kubernetes pods
	kubectl get pods -n $(NAMESPACE)

k8s-events: ## View Kubernetes events
	kubectl get events -n $(NAMESPACE) --sort-by='.lastTimestamp'

k8s-exec: ## Execute shell in pod
	kubectl exec -it -n $(NAMESPACE) $$(kubectl get pod -n $(NAMESPACE) -l app=llm-api-layer -o jsonpath='{.items[0].metadata.name}') -- sh

k8s-port-forward: ## Port forward to local machine
	kubectl port-forward -n $(NAMESPACE) svc/llm-api-layer-service 8080:80

k8s-restart: ## Restart Kubernetes deployment
	kubectl rollout restart deployment/llm-api-layer -n $(NAMESPACE)

k8s-scale: ## Scale deployment (usage: make k8s-scale REPLICAS=5)
	kubectl scale deployment llm-api-layer --replicas=$(REPLICAS) -n $(NAMESPACE)

k8s-rollback: ## Rollback deployment
	kubectl rollout undo deployment/llm-api-layer -n $(NAMESPACE)

k8s-history: ## View rollout history
	kubectl rollout history deployment/llm-api-layer -n $(NAMESPACE)

# Testing endpoints
test-health: ## Test health endpoint
	curl -s http://localhost:3000/health | jq

test-api: ## Test API root endpoint
	curl -s http://localhost:3000 | jq

test-docs: ## Open API documentation
	open http://localhost:3000/api-docs

# Utility targets
lint: ## Run linter (if configured)
	@echo "Linting not configured yet"

format: ## Format code (if configured)
	@echo "Formatting not configured yet"

deps-update: ## Update dependencies
	npm update

deps-audit: ## Audit dependencies for vulnerabilities
	npm audit

deps-fix: ## Fix dependency vulnerabilities
	npm audit fix

# Production targets
prod-check: ## Pre-production checks
	@echo "Running pre-production checks..."
	@echo "✓ Building..."
	@make build
	@echo "✓ Running tests..."
	@make test
	@echo "✓ Auditing dependencies..."
	@npm audit --audit-level=moderate
	@echo "✓ All checks passed!"

# Quick commands
up: docker-compose-up ## Quick start with Docker Compose

down: docker-compose-down ## Quick stop Docker Compose

logs: docker-compose-logs ## Quick view logs
