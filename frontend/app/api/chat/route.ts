import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Try to proxy to backend
    try {
      console.log(`[chat/route] Proxying to backend: ${BACKEND_URL}/api/chat`);
      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      console.log(`[chat/route] Backend response status: ${response.status}`);

      if (response.ok && response.body) {
        // Stream the response from backend
        return new Response(response.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      } else {
        console.log(`[chat/route] Backend response not ok: ${response.status}`);
      }
    } catch (proxyError) {
      // Backend not available, use mock response
      console.log(`[chat/route] Backend proxy error:`, proxyError);
    }

    // Mock response for demo
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const payment = body.payment || {
          payment_id: "TXN-EMRG-001",
          amount: 250000,
          currency: "USD",
          beneficiary_name: "ACME Trading LLC",
          entity: "BankSubsidiary_TR",
        };

        // Simulate sanctions screening
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "agent_status",
              agent: "sanctions-screening-agent",
              status: "running",
            })}\n\n`
          )
        );
        await delay(1500);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "agent_status",
              agent: "sanctions-screening-agent",
              status: "completed",
              decision: "CLEAR",
              summary: "No sanctions match found",
            })}\n\n`
          )
        );

        // Simulate liquidity screening
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "agent_status",
              agent: "liquidity-screening-agent",
              status: "running",
            })}\n\n`
          )
        );
        await delay(1500);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "agent_status",
              agent: "liquidity-screening-agent",
              status: "completed",
              decision: "BREACH",
              summary: "Buffer breach: -$125,000",
            })}\n\n`
          )
        );

        // Simulate operational procedures
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "agent_status",
              agent: "operational-procedures-agent",
              status: "running",
            })}\n\n`
          )
        );
        await delay(2000);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "agent_status",
              agent: "operational-procedures-agent",
              status: "completed",
              decision: "HOLD",
              summary: "Treasury Manager approval required",
            })}\n\n`
          )
        );

        // Final content
        const finalContent = `## Emergency Payment Assessment Complete

### Payment Details
| Field | Value |
|-------|-------|
| Payment ID | ${payment.payment_id} |
| Amount | $${payment.amount.toLocaleString()} ${payment.currency} |
| Beneficiary | ${payment.beneficiary_name} |
| Type | EMERGENCY / SAME_DAY |

### Agent Workflow Results

#### 1. Sanctions Screening
- **Decision:** CLEAR
- **Confidence:** 100%
- **Match Type:** NONE
- No OFAC SDN matches found for "${payment.beneficiary_name}"

#### 2. Liquidity Screening
- **Decision:** BREACH DETECTED
- **Gap Amount:** $125,000
- **Projected Min Balance:** $1,875,000
- **Buffer Threshold:** $2,000,000

#### 3. Operational Procedures
- **Final Action:** HOLD
- **Policy Reference:** runbook_emergency_payment.md Section 6.1
- **Reason:** Sanctions CLEAR but liquidity breach detected

### Required Approvals
1. **Treasury Manager** - Evaluate hold/release options (SLA: 2 hours)
2. **Head of Treasury** - Secondary approval for override (SLA: 4 hours)

### Recommended Workflow
1. HOLD the payment immediately (automatic)
2. Notify Treasury Manager via escalation channel
3. Treasury Manager evaluates options (delay/partial/funding/override)
4. If override selected, obtain Head of Treasury approval
5. Execute decision (release/reject)

### Audit Bundle Required
- Original payment instruction
- Sanctions screening result (full JSON)
- Liquidity impact assessment (full JSON)
- Approval chain with timestamps
- Override justification (if applicable)

**Retention Period:** 7 years`;

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "content",
              content: finalContent,
            })}\n\n`
          )
        );

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error in chat API:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
