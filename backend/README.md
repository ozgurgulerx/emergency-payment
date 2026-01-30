# Emergency Payment Runbook - Backend

Multi-agent orchestration backend for emergency payment processing with sanctions screening, liquidity assessment, and operational procedure compliance.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FastAPI Backend                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐     ┌─────────────────────────────────────────────┐      │
│   │  /api/chat  │────▶│          WorkflowOrchestrator               │      │
│   └─────────────┘     │  ┌────────┐  ┌────────┐  ┌──────────────┐  │      │
│   ┌─────────────┐     │  │ Intake │─▶│Sanctions│─▶│  Liquidity   │  │      │
│   │/api/runbook │────▶│  └────────┘  └────────┘  └──────────────┘  │      │
│   │  /start     │     │                    │              │         │      │
│   └─────────────┘     │                    ▼              ▼         │      │
│   ┌─────────────┐     │            ┌──────────────────────────┐    │      │
│   │/api/runbook │────▶│            │  Operational Procedures  │    │      │
│   │ /stream/id  │     │            └──────────────────────────┘    │      │
│   └─────────────┘     │                         │                   │      │
│   ┌─────────────┐     │                         ▼                   │      │
│   │/api/runbook │────▶│            ┌──────────────────────────┐    │      │
│   │ /result/id  │     │            │    DecisionPacket        │    │      │
│   └─────────────┘     └────────────┴──────────────────────────┴────┘      │
│                                                                             │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐       │
│   │   SSEManager    │  │ RunbookStorage  │  │  FoundryAgentClient │       │
│   │ (Real-time      │  │  (SQLite)       │  │  (Azure AI Foundry) │       │
│   │  streaming)     │  │                 │  │                     │       │
│   └─────────────────┘  └─────────────────┘  └─────────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Azure AI Foundry (ozgurguler-7212)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐  │
│   │  sanctions-screening│  │ liquidity-screening │  │   operational-   │  │
│   │       -agent        │  │      -agent         │  │   procedures-    │  │
│   │                     │  │                     │  │      agent       │  │
│   │  MCP: OFAC SDN      │  │  MCP: PostgreSQL    │  │  MCP: Treasury   │  │
│   │       Index         │  │       Func          │  │       KB         │  │
│   └─────────────────────┘  └─────────────────────┘  └──────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Python 3.11+
- Azure CLI (logged in with `az login`)
- Access to Azure AI Foundry project `ozgurguler-7212`

### Installation

```bash
cd backend

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate  # Linux/Mac
# or: venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Copy environment configuration
cp .env.example .env
# Edit .env with your settings
```

### Running the Server

```bash
# Development mode (with hot reload)
uvicorn app.main:app --reload --port 8000

# Production mode
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Dry-run mode (without Azure credentials)
DRY_RUN_MODE=true uvicorn app.main:app --reload --port 8000
```

### Running Tests

```bash
pytest tests/ -v
```

## API Endpoints

### Health Check

```bash
curl http://localhost:8000/health
```

Response:
```json
{
  "status": "healthy",
  "app": "Emergency Payment Runbook",
  "version": "1.0.0",
  "dry_run_mode": false
}
```

### Start Workflow

```bash
curl -X POST http://localhost:8000/api/runbook/start \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Process emergency payment of $250,000 USD to ACME Trading LLC",
    "overrides": {
      "entity": "BankSubsidiary_TR",
      "channel": "SWIFT"
    }
  }'
```

Response:
```json
{
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "started"
}
```

### Stream Workflow Progress (SSE)

```bash
curl -N http://localhost:8000/api/runbook/stream/{run_id}
```

SSE Events:
```
data: {"run_id":"...","seq":1,"type":"step_started","step":"intake","agent":"orchestrator","ts":"2026-01-30T10:00:00Z","elapsed_ms":0,"payload":{"message":"Starting intake"}}

data: {"run_id":"...","seq":2,"type":"step_completed","step":"intake","agent":"orchestrator","ts":"2026-01-30T10:00:01Z","elapsed_ms":1000,"payload":{"summary":"Payment $250,000 USD to ACME Trading LLC"}}

data: {"run_id":"...","seq":3,"type":"step_started","step":"sanctions","agent":"sanctions-screening-agent","ts":"...","elapsed_ms":1500,"payload":{}}

data: {"run_id":"...","seq":4,"type":"tool_call","step":"sanctions","agent":"sanctions-screening-agent","ts":"...","elapsed_ms":3000,"payload":{"tool":"screen_sanctions","tool_run_id":"run_abc123","output":"CLEAR (100%)"}}

data: {"run_id":"...","seq":5,"type":"step_completed","step":"sanctions","agent":"sanctions-screening-agent","ts":"...","elapsed_ms":3500,"payload":{"summary":"CLEAR: No sanctions match"}}

... (more events)

data: {"run_id":"...","seq":15,"type":"final","step":"summarize","agent":"orchestrator","ts":"...","elapsed_ms":12000,"payload":{"decision":"HOLD","summary":"Liquidity breach detected"}}
```

### Get Workflow Result

```bash
curl http://localhost:8000/api/runbook/result/{run_id}
```

Response (DecisionPacket):
```json
{
  "run_id": "...",
  "payment": {
    "payment_id": "TXN-20260130-ABC123",
    "beneficiary_name": "ACME Trading LLC",
    "amount": 250000.0,
    "currency": "USD",
    "entity": "BankSubsidiary_TR"
  },
  "decision": "HOLD",
  "rationale": [
    "Sanctions screening: CLEAR (100% confidence)",
    "Liquidity assessment: BREACH detected",
    "Final action: HOLD",
    "Payment would breach buffer by $125,000"
  ],
  "procedure_checklist": [
    {
      "step_number": 1,
      "action": "HOLD the payment",
      "responsible": "System (automatic)",
      "documentation_required": "Status timestamp, reason code"
    }
  ],
  "approvals_required": [
    {
      "role": "Treasury Manager",
      "authority": "Evaluate hold/release options",
      "sla_hours": 2
    }
  ],
  "citations": [
    {
      "source": "runbook_emergency_payment.md",
      "snippet": "Per Section 6.1, payments with liquidity breach must be held",
      "reference": "runbook_emergency_payment.md#section-6.1"
    }
  ],
  "audit_note": {
    "sanctions_tool_run_id": "run_abc123",
    "liquidity_tool_run_id": "run_def456",
    "procedures_tool_run_id": "run_ghi789"
  }
}
```

### List Runs

```bash
curl "http://localhost:8000/api/runbook/runs?limit=10&status=completed"
```

### Get Run Details

```bash
curl http://localhost:8000/api/runbook/run/{run_id}
```

### Direct Agent Calls (Testing)

```bash
# Sanctions screening
curl -X POST "http://localhost:8000/api/agents/sanctions/screen?beneficiary_name=ACME%20Trading%20LLC"

# Liquidity check
curl -X POST "http://localhost:8000/api/agents/liquidity/check?amount=250000&currency=USD"
```

## SSE Event Schema

All SSE events follow this structure:

```typescript
interface SSEEvent {
  run_id: string;           // Workflow run identifier
  seq: number;              // Sequence number (1-based)
  type: EventType;          // Event type (see below)
  step: WorkflowStep;       // Current workflow step
  agent: string;            // Agent name or "orchestrator"
  ts: string;               // ISO8601 timestamp
  elapsed_ms: number;       // Elapsed time since workflow start
  payload: object;          // Event-specific data
}

type EventType =
  | "step_started"      // Workflow step begins
  | "step_completed"    // Workflow step ends
  | "agent_message"     // Agent generated text output
  | "tool_call"         // Tool/function was invoked
  | "kb_query"          // Knowledge base was queried
  | "branch"            // Workflow branching decision
  | "error"             // Error occurred
  | "final";            // Final decision emitted

type WorkflowStep =
  | "intake"            // Parse payment request
  | "sanctions"         // Sanctions screening
  | "liquidity"         // Liquidity assessment
  | "procedures"        // Operational procedures
  | "summarize";        // Generate final decision
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AZURE_FOUNDRY_PROJECT` | `ozgurguler-7212` | Azure AI Foundry project name |
| `AZURE_FOUNDRY_PROJECT_ENDPOINT` | `https://...` | Project endpoint URL |
| `AZURE_FOUNDRY_AGENT_SANCTIONS` | `sanctions-screening-agent` | Sanctions agent name |
| `AZURE_FOUNDRY_AGENT_LIQUIDITY` | `liquidity-screening-agent` | Liquidity agent name |
| `AZURE_FOUNDRY_AGENT_PROCEDURES` | `operational-procedures-agent` | Procedures agent name |
| `DRY_RUN_MODE` | `false` | Stub agent responses |
| `DATABASE_URL` | `sqlite:///./runbook.db` | SQLite database path |
| `LOG_LEVEL` | `INFO` | Logging level |
| `LOG_FORMAT` | `json` | Log format (json/text) |
| `MAX_RETRIES` | `3` | Agent call retry attempts |

## Project Structure

```
backend/
├── app/
│   ├── __init__.py           # Package init
│   ├── main.py               # FastAPI application
│   ├── orchestrator.py       # Workflow orchestration
│   ├── foundry_client.py     # Azure AI Foundry client
│   ├── storage.py            # SQLite persistence
│   ├── sse.py                # SSE streaming manager
│   ├── schemas.py            # Pydantic models
│   ├── config.py             # Settings management
│   └── logging_config.py     # Structured logging
├── tests/
│   ├── __init__.py
│   └── test_smoke.py         # Smoke tests
├── requirements.txt          # Python dependencies
├── .env.example              # Environment template
└── README.md                 # This file
```

## Workflow Logic

### Decision Matrix

| Sanctions | Liquidity Breach | Action | Approver |
|-----------|------------------|--------|----------|
| BLOCK | * | REJECT | Compliance Officer |
| ESCALATE | * | HOLD + Review | Compliance Manager + MLRO |
| CLEAR | true | HOLD | Treasury Manager |
| CLEAR | false | RELEASE | Payments Operator |

### Error Handling

- **Sanctions failure**: Returns `ESCALATE` decision with manual review required
- **Liquidity failure**: Returns `ESCALATE` with "system degradation" note
- **Procedures failure**: Returns `HOLD` with manual review required
- All errors are logged with full context and persisted for audit

## Development

### Dry-Run Mode

When `DRY_RUN_MODE=true` or Azure credentials are not available:
- Agent calls return stubbed responses
- Simulates realistic latency
- Useful for frontend development and testing

### Adding New Agents

1. Add agent name to `config.py`
2. Create method in `foundry_client.py`
3. Add step to `orchestrator.py`
4. Update schemas if new data structures needed

### Logging

All logs are structured JSON with the following fields:
- `timestamp`, `level`, `logger`, `message`
- `run_id`, `step`, `agent`, `elapsed_ms` (when in workflow context)
- PII is automatically redacted

## License

Internal use only - Microsoft
