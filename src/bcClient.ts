// Thin BuildingConnected (Autodesk APS) REST client.
// Base + auth per the APS BuildingConnected v2 API. In "test" mode it sends the
// x-bc-mode: test header, which returns Autodesk's realistic sample data (GET only,
// no subscription/seat required) - exactly what the demo runs on.
import { getAccessToken } from "./apsAuth.js";

const BC_BASE = "https://developer.api.autodesk.com/construction/buildingconnected/v2";
const BC_MODE = process.env.BC_MODE || "test";

type Query = Record<string, string | number | undefined>;

export async function bcGet(path: string, query?: Query): Promise<unknown> {
  const token = await getAccessToken();
  const url = new URL(BC_BASE + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (BC_MODE === "test") headers["x-bc-mode"] = "test";

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    throw new Error(`BuildingConnected ${res.status} on ${path}: ${await res.text()}`);
  }
  return res.json();
}

export function bcMode(): string {
  return BC_MODE;
}
