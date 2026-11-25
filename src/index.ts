#!/usr/bin/env node
import { runServer } from "./server.js";

runServer().catch((error: unknown) => {
  console.error("fauxmcp failed to start:", error);
  process.exit(1);
});
