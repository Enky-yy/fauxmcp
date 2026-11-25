import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Build a successful text tool result. */
export function ok(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

/** Build an error tool result (shown to the model, not thrown). */
export function fail(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: `❌ ${message}` }],
    isError: true,
  };
}

/** Extract a readable message from an unknown thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Wrap a handler so thrown errors become tool errors instead of crashing the
 * server. Keeps every tool's failure mode consistent.
 */
export function withErrors<A>(
  handler: (args: A) => Promise<CallToolResult>,
): (args: A) => Promise<CallToolResult> {
  return async (args: A) => {
    try {
      return await handler(args);
    } catch (err) {
      return fail(errorMessage(err));
    }
  };
}
