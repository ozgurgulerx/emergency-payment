import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/ic/policy
 *
 * Accepts an InvestorPolicyStatement and starts a portfolio optimization run.
 * In demo mode (no backend), this just generates a run ID.
 * In production, this would forward to the Python backend.
 */
export async function POST(request: NextRequest) {
  try {
    const policy = await request.json();

    // Generate a unique run ID
    const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // In production, we would forward to the backend:
    // const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
    // const response = await fetch(`${backendUrl}/api/ic/policy`, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify(policy),
    // });
    // return NextResponse.json(await response.json());

    // For demo mode, just return the run ID
    // The Mission Control page will use mock events
    console.log("Starting portfolio optimization run:", runId);
    console.log("Policy:", JSON.stringify(policy, null, 2));

    return NextResponse.json({
      run_id: runId,
      status: "started",
      message: "Portfolio optimization started (demo mode)",
    });
  } catch (error) {
    console.error("Error starting run:", error);
    return NextResponse.json(
      { error: "Failed to start run" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ic/policy/templates
 *
 * Returns available policy templates.
 */
export async function GET() {
  return NextResponse.json({
    templates: [
      {
        id: "conservative",
        name: "Conservative",
        description: "Lower risk, stable income focus",
      },
      {
        id: "balanced",
        name: "Balanced",
        description: "Moderate risk, growth and income",
      },
      {
        id: "aggressive",
        name: "Aggressive",
        description: "Higher risk, growth focus",
      },
    ],
  });
}
