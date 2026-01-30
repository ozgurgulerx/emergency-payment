# Emergency Payment Runbook

AI-powered emergency payment processing with multi-agent orchestration for sanctions screening, liquidity assessment, and operational procedure compliance.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Emergency Payment Runbook                     │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (Next.js 15)           │  Backend (FastAPI)           │
│  - Obsidian Ledger UI            │  - Agent Orchestrator        │
│  - Real-time status updates      │  - SSE Streaming             │
│  - Chat interface                │  - Azure AI Foundry Client   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Azure AI Foundry (ozgurguler-7212)                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐   │
│  │   Sanctions   │  │   Liquidity   │  │   Operational     │   │
│  │   Screening   │──│   Screening   │──│   Procedures      │   │
│  │   Agent       │  │   Agent       │  │   Agent           │   │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────────┘   │
│          │                  │                  │               │
│          ▼                  ▼                  ▼               │
│    ┌──────────┐       ┌──────────┐       ┌──────────┐         │
│    │ OFAC SDN │       │ PostgreSQL│       │ Treasury │         │
│    │ Index    │       │ Liquidity │       │ KB Index │         │
│    │ (Search) │       │ Data      │       │ (Search) │         │
│    └──────────┘       └──────────┘       └──────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

## Agents

### 1. Sanctions Screening Agent
- Screens beneficiaries against OFAC SDN list (18,557 entities)
- Fuzzy matching using Lucene query syntax
- Returns: BLOCK / ESCALATE / CLEAR

### 2. Liquidity Screening Agent
- Computes intraday liquidity impact
- Queries PostgreSQL with 3,001+ transactions
- Checks buffer thresholds per entity/currency
- Returns: BREACH / NO_BREACH

### 3. Operational Procedures Agent
- Applies treasury policies from knowledge base
- Determines workflow and approval requirements
- Returns: PROCEED / HOLD / REJECT

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- Azure CLI (logged in)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/chat` | POST | Process payment through workflow (SSE) |
| `/api/screen-sanctions` | POST | Direct sanctions screening |
| `/api/check-liquidity` | POST | Direct liquidity check |
| `/api/agents` | GET | List available agents |

## Environment Variables

```env
# Copied from af-pii-funds project
AZURE_AI_PROJECT_ENDPOINT=https://ozgurguler-7212-resource.services.ai.azure.com/api/projects/ozgurguler-7212
```

## Decision Matrix

| Sanctions | Liquidity Breach | Before Cutoff | Action | Approver |
|-----------|------------------|---------------|--------|----------|
| BLOCK | * | * | REJECT + Open Case | Compliance Officer |
| ESCALATE | * | * | HOLD + Compliance Review | Compliance Manager + MLRO |
| CLEAR | true | true | HOLD + Partial Release Option | Treasury Manager |
| CLEAR | true | false | REJECT (Cutoff Missed) | Treasury Manager |
| CLEAR | false | true | PROCEED | Payments Operator |
| CLEAR | false | false | REJECT (Cutoff Missed) | Payments Operator |

## Project Structure

```
emergency-payment/
├── frontend/
│   ├── app/
│   │   ├── globals.css      # Obsidian Ledger theme
│   │   ├── layout.tsx       # Root layout with fonts
│   │   └── page.tsx         # Main chat interface
│   ├── components/
│   │   ├── ui/              # shadcn-style components
│   │   └── providers/       # Theme provider
│   ├── lib/
│   │   └── utils.ts         # cn() utility
│   ├── tailwind.config.ts
│   └── package.json
├── backend/
│   ├── main.py              # FastAPI app with orchestrator
│   ├── requirements.txt
│   └── .env
└── README.md
```

## License

Internal use only - Microsoft
