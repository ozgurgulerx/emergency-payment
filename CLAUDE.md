# Claude Code Project Instructions

## Critical Rules

### DO NOT MODIFY
The following projects and resources must NEVER be modified:
- **fund-rag namespace on AKS** - Do not touch deployments, services, or configurations
- **ic-autopilot namespace on aks-fund-rag** - Do not touch existing deployments
- **fund-rag-poc project** - This is a separate production system
- **rg-fund-rag resource group** - Do not modify existing resources
- **fundrag-frontend App Service** - Production app, do not touch
- **ic-autopilot-frontend App Service** - Existing deployment, do not touch
- **aks-fund-rag AKS cluster** - Do not modify cluster configuration

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

## AZURE POSTGRESQL PROTECTION:
The database at `aistartupstr.postgres.database.azure.com` is **STRICTLY READ-ONLY**:
- All connections MUST use: `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`
- NEVER execute: INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, TRUNCATE
- NEVER modify schemas, tables, indexes, or constraints
- NEVER create or modify database users or roles
- NEVER run migration scripts against this database

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

### THIS PROJECT - emrgpay (CORRECT DEPLOYMENT)
- **Resource Group**: `rg-emrgpay`
- **Frontend**: Azure App Service `emrgpay-frontend`
- **Frontend URL**: https://emrgpay-frontend.azurewebsites.net
- **Location**: West US 2
- **App Service Plan**: `asp-emrgpay` (B1)
- **Runtime**: Node 20-lts on Linux

### Model Deployments (Azure OpenAI)
- **Agents** (Market, Risk, Return, Optimizer, Compliance): `gpt-5-nano`
  - Environment variable: `AZURE_OPENAI_AGENT_DEPLOYMENT`
- **Orchestrator** (Magentic Manager, GroupChat Manager): `gpt-5-mini`
  - Environment variable: `AZURE_OPENAI_ORCHESTRATOR_DEPLOYMENT`

### DO NOT USE - Other Resource Groups
- ❌ `rg-pii-multiagent` - Different project, do not deploy here
- ❌ `pii-multiagent-frontend` - Different app service, do not touch
- ❌ `rg-fund-rag` - Production system, do not touch

### Shared Resources (READ-ONLY, DO NOT MODIFY)
- **Database**: PostgreSQL `aistartupstr.postgres.database.azure.com` / `fundrag` / `nport_funds` - **READ-ONLY**
- **PII Container**: `pii-ozguler.eastus.azurecontainer.io:5000`
- **Azure OpenAI**: `aoai-ep-swedencentral02.openai.azure.com`
- **AI Search**: `chatops-ozguler.search.windows.net`

## Environment

- **ACR**: `aistartuptr.azurecr.io`
- **Backend image**: `pii-multiagent-backend`
- **Frontend**: Deployed via zip to `emrgpay-frontend` App Service
- **GitHub Workflow**: `.github/workflows/deploy-frontend.yaml`
  - App Service: `emrgpay-frontend`
  - Resource Group: `rg-emrgpay`

## Agent Framework Architecture

The backend uses Microsoft Agent Framework for Python (`agent-framework` package) for multi-agent orchestration.

### Key Components

#### Agents (`backend/agents/`)
- **ChatAgent**: Core agent class from Agent Framework
- **AzureOpenAIChatClient**: Azure OpenAI integration with `DefaultAzureCredential`
- **@ai_function decorator**: Tool/function definitions (NOT @tool)

Agents:
- `market.py` - Market data and universe building
- `risk.py` - Risk analysis (VaR, stress tests)
- `return_agent.py` - Return forecasting
- `optimizer.py` - Portfolio optimization
- `compliance.py` - Regulatory compliance

#### Orchestration Patterns (`backend/orchestrator/`)

Available workflow types (via `workflow_type` parameter):

| Type | Builder | Description |
|------|---------|-------------|
| `sequential` | `SequentialBuilder` | Linear: Market → Risk → Return → Optimizer → Compliance |
| `concurrent` | `ConcurrentBuilder` | Parallel risk/return with fan-out/fan-in aggregation |
| `handoff` | `HandoffBuilder` | Coordinator delegates to specialists (recommended) |
| `magentic` | `MagenticBuilder` | LLM-powered dynamic planning and execution |
| `dag` | `WorkflowBuilder` | Custom directed acyclic graph with explicit edges |
| `group_chat` | `GroupChatBuilder` | Multi-agent consensus discussions |

#### Event Flow
- Workflow events stream via Redis Streams
- SSE endpoint: `/api/ic/runs/{run_id}/events`
- Event types: `workflow.started`, `executor.invoked`, `agent.completed`, `workflow.output`

#### Key Files
- `backend/orchestrator/engine.py` - OrchestratorEngine with checkpointing
- `backend/orchestrator/workflows.py` - Workflow factory functions
- `backend/orchestrator/executors.py` - Custom Executor classes
- `backend/orchestrator/middleware.py` - Event emission, ContextProviders

### Agent Framework Features Used

1. **ChatAgent** - Core agent with instructions and tools
2. **@ai_function** - Tool/function decorator (Azure AI compatible)
3. **Workflow Builders** - Sequential, Concurrent, Handoff, Magentic, DAG, GroupChat
4. **WorkflowContext** - State passing in custom executors
5. **Workflow Events** - ExecutorInvokedEvent, AgentRunEvent, etc.
6. **InMemoryCheckpointStorage** - Fault tolerance checkpointing
7. **ContextProvider** - Evidence injection into agent calls

### API Endpoints

- `POST /api/ic/policy` - Start orchestrator run (accepts `workflow_type` param)
- `GET /api/ic/workflows` - List available workflow patterns
- `GET /api/ic/runs/{run_id}/events` - SSE event stream
- `GET /api/ic/policy/templates` - Pre-defined IPS templates
