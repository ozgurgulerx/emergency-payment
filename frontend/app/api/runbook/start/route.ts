import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/runbook/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: "Failed to start runbook", details: error },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error starting runbook:", error);

    // Return a mock run_id for demo mode when backend is not available
    const mockRunId = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return NextResponse.json({
      run_id: mockRunId,
      status: "started",
      demo_mode: true,
    });
  }
}
