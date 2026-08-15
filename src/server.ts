// Remote MCP connector for BuildingConnected, served over streamable HTTP so ChatGPT
// (and any MCP client) can call it. Exposes a curated set of read-only tools against
// the BuildingConnected test environment.
import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { bcGet, bcMode } from "./bcClient.js";
import { authorizeUrl, exchangeCode, isConfigured, hasToken } from "./apsAuth.js";

const PORT = Number(process.env.PORT || 3000);

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function buildServer(): McpServer {
  const server = new McpServer({ name: "buildingconnected-connector", version: "0.1.0" });

  server.registerTool(
    "whoami",
    { title: "Who am I", description: "Return the authenticated BuildingConnected user profile.", inputSchema: {} },
    async () => textResult(await bcGet("/users/me")),
  );

  server.registerTool(
    "list_bid_packages",
    {
      title: "List bid packages",
      description: "List BuildingConnected bid packages (invitations to bid). Returns the most recent first.",
      inputSchema: { limit: z.number().int().min(1).max(100).optional(), cursorState: z.string().optional() },
    },
    async ({ limit, cursorState }) => textResult(await bcGet("/bid-packages", { limit: limit ?? 20, cursorState })),
  );

  server.registerTool(
    "get_bid_package",
    { title: "Get bid package", description: "Get a single BuildingConnected bid package by its id.", inputSchema: { id: z.string() } },
    async ({ id }) => textResult(await bcGet(`/bid-packages/${encodeURIComponent(id)}`)),
  );

  server.registerTool(
    "list_bids",
    {
      title: "List bids",
      description: "List bids, optionally filtered to a single bid package by bidPackageId.",
      inputSchema: { bidPackageId: z.string().optional(), limit: z.number().int().min(1).max(100).optional() },
    },
    async ({ bidPackageId, limit }) => textResult(await bcGet("/bids", { bidPackageId, limit: limit ?? 20 })),
  );

  server.registerTool(
    "list_opportunities",
    {
      title: "List opportunities (Bid Board)",
      description: "List Bid Board opportunities (incoming bid invitations tracked in BuildingConnected).",
      inputSchema: { limit: z.number().int().min(1).max(100).optional(), cursorState: z.string().optional() },
    },
    async ({ limit, cursorState }) => textResult(await bcGet("/opportunities", { limit: limit ?? 20, cursorState })),
  );

  server.registerTool(
    "get_opportunity",
    { title: "Get opportunity", description: "Get a single Bid Board opportunity by its id.", inputSchema: { id: z.string() } },
    async ({ id }) => textResult(await bcGet(`/opportunities/${encodeURIComponent(id)}`)),
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List BuildingConnected projects.",
      inputSchema: { limit: z.number().int().min(1).max(100).optional() },
    },
    async ({ limit }) => textResult(await bcGet("/projects", { limit: limit ?? 20 })),
  );

  return server;
}

const app = express();
app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "buildingconnected-connector",
    mode: bcMode(),
    configured: isConfigured(),
    authenticated: hasToken(),
    endpoints: { mcp: "/mcp", login: "/auth/login", health: "/" },
  });
});

app.get("/auth/login", (_req: Request, res: Response) => {
  if (!isConfigured()) {
    res.status(500).send("APS not configured. Set APS_CLIENT_ID, APS_CLIENT_SECRET and APS_CALLBACK_URL.");
    return;
  }
  res.redirect(authorizeUrl());
});

app.get("/auth/callback", async (req: Request, res: Response) => {
  const code = String(req.query.code || "");
  if (!code) {
    res.status(400).send("Missing authorization code.");
    return;
  }
  try {
    await exchangeCode(code);
    res.send("Connected to Autodesk BuildingConnected. You can close this tab - the connector is now live.");
  } catch (err) {
    res.status(500).send("Authentication failed: " + (err as Error).message);
  }
});

// Stateless streamable-HTTP MCP endpoint (a fresh server+transport per request).
app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: (err as Error).message }, id: null });
    }
  }
});

app.get("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({ error: "Method Not Allowed. Use POST for the MCP endpoint." });
});

app.listen(PORT, () => {
  console.log(`[bc-connector] listening on :${PORT} (BC_MODE=${bcMode()})`);
});
