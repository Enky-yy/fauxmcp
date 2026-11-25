import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { serverInfo } from "./lib/env.js";
import { registerResources } from "./resources.js";
import { registerGenerationTools } from "./tools/generate.js";
import { registerRetrievalTools } from "./tools/retrieve.js";

/** Build a configured MCP server (all tools + resources registered). */
export function createServer(): McpServer {
  const server = new McpServer(serverInfo, {
    instructions:
      "fauxmcp is a data toolbox. Use generate_* tools to invent realistic test data " +
      "(seeded for reproducibility), and fetch_dataset / scrape_table / query_public_api " +
      "to pull real datasets from URLs and public APIs. Large results are cached locally: " +
      "browse them with list_saved_datasets and page through them with read_saved_dataset.",
  });
  registerGenerationTools(server);
  registerRetrievalTools(server);
  registerResources(server);
  return server;
}

/** Start the server over stdio. */
export async function runServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Logs must go to stderr: stdout is the MCP protocol channel.
  console.error(`fauxmcp v${serverInfo.version} running on stdio`);
}
