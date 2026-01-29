# Claude Code Project Instructions

## Critical Rules

### DO NOT MODIFY
The following projects and resources must NEVER be modified:
- **fund-rag namespace on AKS** - Do not touch deployments, services, or configurations
- **fund-rag-poc project** - This is a separate production system
- **rg-fund-rag resource group** - Only add new resources, never modify existing ones

### Separate Deployments
- IC Autopilot uses the `ic-autopilot` namespace - keep it isolated
- Use separate resource names prefixed with `ic-autopilot-`
- Do not share secrets or configurations with fund-rag

## Project Structure

```
af-pii-multi-agent/
├── backend/          # FastAPI backend
├── frontend/         # Next.js frontend
├── worker/           # Workflow executors
├── infra/            # Helm charts and scripts
├── k8s/              # Kubernetes manifests
└── tests/            # Test suite
```

## Deployment Targets

- **Backend**: AKS cluster (aks-fund-rag), namespace: ic-autopilot
- **Frontend**: Azure App Service (ic-autopilot-frontend)
- **Database**: PostgreSQL (aistartupstr), schema: ic_autopilot

## Environment

- ACR: aistartuptr.azurecr.io
- Backend image: ic-autopilot-backend
- Frontend image: ic-autopilot-frontend
