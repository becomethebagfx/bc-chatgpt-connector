// Autodesk Platform Services (APS) 3-legged OAuth for the BuildingConnected API.
// BuildingConnected requires a user-context (3-legged) token. For the demo we run the
// authorization-code flow once (a person visits /auth/login), then hold + refresh the
// token server-side so the MCP tools can call the API.
import { Buffer } from "node:buffer";

const APS_BASE = "https://developer.api.autodesk.com";
const CLIENT_ID = process.env.APS_CLIENT_ID || "";
const CLIENT_SECRET = process.env.APS_CLIENT_SECRET || "";
const CALLBACK = process.env.APS_CALLBACK_URL || "";
const SCOPES = process.env.APS_SCOPES || "data:read";

type TokenSet = { access_token: string; refresh_token?: string; expires_at: number };
let tokens: TokenSet | null = null;

export function isConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && CALLBACK);
}

export function hasToken(): boolean {
  return tokens !== null;
}

export function authorizeUrl(state = "bc"): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: CALLBACK,
    scope: SCOPES,
    state,
  });
  return `${APS_BASE}/authentication/v2/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<void> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: CALLBACK,
  });
  tokens = await tokenRequest(body);
}

async function refresh(): Promise<void> {
  if (!tokens?.refresh_token) {
    throw new Error("No refresh token available. Visit /auth/login once to authenticate.");
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    scope: SCOPES,
  });
  tokens = await tokenRequest(body);
}

async function tokenRequest(body: URLSearchParams): Promise<TokenSet> {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${APS_BASE}/authentication/v2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`APS token request failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? tokens?.refresh_token,
    // refresh a minute early to avoid edge-of-expiry 401s
    expires_at: Date.now() + (json.expires_in ?? 3500) * 1000 - 60_000,
  };
}

export async function getAccessToken(): Promise<string> {
  if (!tokens) {
    throw new Error("Not authenticated with Autodesk yet. Open /auth/login in a browser once.");
  }
  if (Date.now() >= tokens.expires_at) {
    await refresh();
  }
  return tokens!.access_token;
}
