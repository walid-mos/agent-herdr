import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const TOKEN_KEY = "CLAUDE_CODE_OAUTH_TOKEN";
const SETUP_TOKEN_USER = /^Claude setup-token ([0-9a-f]{6})$/;
const ORGANIZATION_URL = "https://api.anthropic.com/v1/models?limit=1";
const ORGANIZATION_HEADER = "anthropic-organization-id";
const OAUTH_HEADERS = { "anthropic-beta": "oauth-2025-04-20", "anthropic-version": "2023-06-01" };
const REQUEST_TIMEOUT_MS = 15_000;
const CLAUDE_CONFIG = join(homedir(), ".claude.json");
// A personal plan's organization has one member, so it names one account; a team organization does not.
const PERSONAL_ORGANIZATION_TYPES = ["claude_max", "claude_pro"];

const readJson = async (file) => JSON.parse(await readFile(file, "utf8").catch(() => "null"));

async function loginOrganizations() {
  const login = (await readJson(CLAUDE_CONFIG))?.oauthAccount;
  if (!login?.emailAddress || !PERSONAL_ORGANIZATION_TYPES.includes(login.organizationType)) return {};
  return { [login.emailAddress]: login.organizationUuid };
}

function exportedToken(prefix) {
  const token = process.env[TOKEN_KEY];
  if (!token) return null;
  return createHash("sha256").update(token).digest("hex").startsWith(prefix) ? token : null;
}

async function askOrganization(token) {
  const response = await fetch(ORGANIZATION_URL, {
    headers: { Authorization: `Bearer ${token}`, ...OAUTH_HEADERS },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return response.ok ? response.headers.get(ORGANIZATION_HEADER) : null;
}

async function tokenOrganization(prefix, cacheFile) {
  const cache = (await readJson(cacheFile)) ?? {};
  if (cache[prefix]) return cache[prefix];
  const token = exportedToken(prefix);
  if (!token) return null;
  const organization = await askOrganization(token).catch(() => null);
  // The cache only saves a request; failing to write it must not fail the read.
  if (organization) await writeFile(cacheFile, JSON.stringify({ ...cache, [prefix]: organization })).catch(() => {});
  return organization;
}

export function claudeAccountOf(cacheFile) {
  const logins = loginOrganizations();
  return async (subscription) => {
    const prefix = SETUP_TOKEN_USER.exec(subscription.user ?? "")?.[1];
    if (prefix) return tokenOrganization(prefix, cacheFile);
    return (await logins)[subscription.user] ?? null;
  };
}
