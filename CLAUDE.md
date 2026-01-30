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
