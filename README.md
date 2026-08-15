# BuildingConnected ChatGPT Connector

A remote MCP (Model Context Protocol) server that bridges ChatGPT to **BuildingConnected**
(Autodesk Platform Services). It runs against the **free BuildingConnected test environment**
(`x-bc-mode: test`), which returns Autodesk's realistic sample bid data with no paid seat
required, so it can be demoed end to end.

Built by The Solution Service for the CA Marketing engagement. See the opportunity brief
"The Jobsite Bridge".

## What it exposes

Read-only MCP tools over the BuildingConnected v2 API:

- `whoami` - the authenticated user profile
- `list_bid_packages` / `get_bid_package`
- `list_bids`
- `list_opportunities` / `get_opportunity` (Bid Board)
- `list_projects`

## How it works

```
ChatGPT  --(streamable HTTP /mcp)-->  this server  --(Bearer + x-bc-mode:test)-->  BuildingConnected API
```

Authentication is Autodesk 3-legged OAuth. A person visits `/auth/login` once to authorize;
the server then holds and refreshes the token so the MCP tools can call the API.

## Configure

Copy `.env.example` and fill in the APS app credentials (from an app created at
aps.autodesk.com once a developer hub exists):

- `APS_CLIENT_ID`, `APS_CLIENT_SECRET`
- `APS_CALLBACK_URL` - must exactly match the app's registered Callback URL, e.g.
  `https://<service>.onrender.com/auth/callback`
- `APS_SCOPES` (default `data:read`)
- `BC_MODE` (`test` for sample data, `live` for a real tenant)

## Run

```
npm install
npm run build
npm start          # http://localhost:3000  (health at /, MCP at /mcp)
```

Then open `/auth/login` once to connect Autodesk, and point an MCP client (ChatGPT custom
connector, or MCP Inspector) at `<url>/mcp`.

## Deploy

Containerized (`Dockerfile`) for Render or any host. Render sets `PORT` automatically.
Set the env vars above in the service configuration.
