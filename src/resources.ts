import {
  ResourceTemplate,
  type McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDataset, listDatasets } from "./lib/cache.js";

function mimeFor(format: string): string {
  switch (format) {
    case "csv":
      return "text/csv";
    case "tsv":
      return "text/tab-separated-values";
    case "json":
      return "application/json";
    case "sql":
      return "application/sql";
    case "md":
    case "markdown":
      return "text/markdown";
    case "html":
      return "text/html";
    default:
      return "text/plain";
  }
}

/**
 * Expose cached datasets as MCP resources so clients that support resources can
 * browse and read them directly, without a tool round-trip.
 */
export function registerResources(server: McpServer): void {
  server.registerResource(
    "dataset-index",
    "fauxmcp://datasets",
    {
      title: "Saved datasets index",
      description: "JSON index of every dataset cached by fauxmcp",
      mimeType: "application/json",
    },
    async (uri) => {
      const datasets = await listDatasets();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(datasets, null, 2),
          },
        ],
      };
    },
  );

  const template = new ResourceTemplate("fauxmcp://datasets/{id}", {
    list: async () => {
      const datasets = await listDatasets();
      return {
        resources: datasets.map((dataset) => ({
          uri: `fauxmcp://datasets/${dataset.id}`,
          name: dataset.name,
          title: dataset.name,
          mimeType: mimeFor(dataset.format),
          description:
            `${dataset.kind} · ${dataset.format}` +
            (dataset.rows !== undefined ? ` · ${dataset.rows} rows` : "") +
            ` · ${dataset.bytes} bytes`,
        })),
      };
    },
    complete: {
      id: async (value: string) => {
        const datasets = await listDatasets();
        return datasets.map((dataset) => dataset.id).filter((id) => id.startsWith(value));
      },
    },
  });

  server.registerResource(
    "dataset",
    template,
    {
      title: "Saved dataset",
      description: "A dataset cached by fauxmcp",
      mimeType: "text/plain",
    },
    async (uri, variables) => {
      const raw = variables.id;
      const id = Array.isArray(raw) ? raw[0] : raw;
      if (!id) throw new Error("Missing dataset id in resource URI");
      const dataset = await getDataset(String(id));
      if (!dataset) throw new Error(`Dataset "${id}" not found`);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: mimeFor(dataset.meta.format),
            text: dataset.content,
          },
        ],
      };
    },
  );
}
