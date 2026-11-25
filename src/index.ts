import { serverInfo } from "./lib/env.js";
import { runServer } from "./server.js";

const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  console.log(serverInfo.version);
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      `fauxmcp v${serverInfo.version} — fake and real data for MCP clients`,
      "",
      "Usage: fauxmcp            start the MCP server on stdio",
      "       fauxmcp --help     show this help",
      "       fauxmcp --version  print the version",
      "",
      "Configure it in your MCP client (Claude Desktop, Cursor, VS Code, …)",
      "with command \"npx\" and args [\"-y\", \"@enky-yy/fauxmcp\"].",
      "",
      "Docs: https://github.com/Enky-yy/fauxmcp",
    ].join("\n"),
  );
  process.exit(0);
}

runServer().catch((error: unknown) => {
  console.error("fauxmcp failed to start:", error);
  process.exit(1);
});
