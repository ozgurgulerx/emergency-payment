import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

/**
 * SSE streaming proxy — explicitly pipes chunks from the FastAPI backend
 * to the browser. This ensures unbuffered streaming regardless of the
 * Next.js rewrite / infrastructure proxy behaviour.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await fetch(
          `${BACKEND_URL}/api/runbook/stream/${runId}`,
          {
            headers: { Accept: "text/event-stream" },
            // @ts-expect-error — Node fetch supports this for streaming
            signal: request.signal,
          }
        );

        if (!response.ok) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message: "Failed to connect to backend" })}\n\n`
            )
          );
          controller.close();
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message: "No response body" })}\n\n`
            )
          );
          controller.close();
          return;
        }

        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          controller.enqueue(encoder.encode(chunk));
        }

        controller.close();
      } catch (error) {
        console.error("SSE proxy error:", error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: "SSE proxy connection failed" })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
