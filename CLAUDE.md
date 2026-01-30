# Claude Code Project Instructions

## Critical Rules

### DO NOT MODIFY
The following projects and resources must NEVER be modified:
- **fund-rag namespace on AKS** - Do not touch deployments, services, or configurations
- **fund-rag-poc project** - This is a separate production system
- **rg-fund-rag resource group** - Only add new resources, never modify existing ones

### DATABASE PROTECTION - ABSOLUTE & NON-NEGOTIABLE
**THIS IS THE MOST CRITICAL RULE - ZERO EXCEPTIONS UNDER ANY CIRCUMSTANCES**

## NEVER TOUCH THE EXISTING DATABASE
- ❌ **DO NOT** alter, modify, delete, or change ANYTHING in the existing database
- ❌ **DO NOT** run ANY DDL commands (ALTER, DROP, TRUNCATE, etc.)
- ❌ **DO NOT** run UPDATE or DELETE on ANY existing table
- ❌ **DO NOT** modify schemas, tables, indexes, or constraints
- ❌ **DO NOT** change permissions or roles
- ❌ **DO NOT** even attempt to "fix" or "improve" existing database objects

## IF NEW DATABASE OBJECTS ARE NEEDED:
- ✅ **CREATE A NEW DATABASE** - do not use existing databases
- ✅ Or create a completely new schema with a unique name
- ✅ Only SELECT (read) from existing tables - nothing else
- ✅ Ask the user before ANY database operation

## EXISTING DATABASES ARE OFF-LIMITS:
- `fundrag` database - **READ-ONLY, DO NOT MODIFY**
- `nport_funds` schema - **READ-ONLY, DO NOT MODIFY**
- `public` schema - **DO NOT USE**
- Any existing tables - **DO NOT TOUCH**

**Breaking this rule will destroy production applications.**
**When in doubt, ASK THE USER first.**

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
