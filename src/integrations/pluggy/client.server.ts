// Cliente HTTP server-only para a API da Pluggy (Open Finance).
// SECURITY: PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET e o apiKey derivado nunca
// devem chegar ao navegador — todas as chamadas aqui rodam só no servidor.

const PLUGGY_BASE_URL = "https://api.pluggy.ai";

export interface PluggyAccount {
  id: string;
  itemId: string;
  type: "BANK" | "CREDIT";
  subtype: string;
  name: string;
  number?: string | null;
  balance: number;
  bankData?: {
    // "banco/agência/conta", ex: "260/0001/12345678-9" (260 = Nubank, 348 = XP)
    transferNumber?: string | null;
  } | null;
  creditData?: {
    creditLimit?: number;
    availableCreditLimit?: number;
  };
}

export interface PluggyTransaction {
  id: string;
  amount: number;
  date: string;
  description: string;
  category: string | null;
  categoryId: string | null;
  type: "CREDIT" | "DEBIT";
}

export interface PluggyItem {
  id: string;
  status: string;
  connector: { name: string };
}

export interface PluggyInvestment {
  id: string;
  name: string;
  code: string | null;
  type: string;
  subtype: string | null;
  balance: number | null;
  value: number | null;
  quantity: number | null;
  amountOriginal: number | null;
  rate: number | null;
  rateType: string | null;
  dueDate: string | null;
  issuer: string | null;
  status: string | null;
  date: string | null;
}

export class PluggyApiError extends Error {
  constructor(public status: number, body: string) {
    super(`Pluggy API error ${status}: ${body}`);
  }
}

async function pluggyFetch<T>(path: string, init: RequestInit & { apiKey?: string } = {}): Promise<T> {
  const { apiKey, ...rest } = init;
  const res = await fetch(`${PLUGGY_BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "X-API-KEY": apiKey } : {}),
      ...rest.headers,
    },
  });
  if (!res.ok) throw new PluggyApiError(res.status, await res.text());
  return res.json();
}

let cachedApiKey: { value: string; expiresAt: number } | undefined;
// Válido por 2h segundo a Pluggy; cacheamos com folga de segurança.
const API_KEY_TTL_MS = 110 * 60 * 1000;

function getCredentials() {
  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const missing = [
      ...(!clientId ? ["PLUGGY_CLIENT_ID"] : []),
      ...(!clientSecret ? ["PLUGGY_CLIENT_SECRET"] : []),
    ];
    throw new Error(
      `Variável(is) de ambiente da Pluggy faltando: ${missing.join(", ")}. Crie uma conta em https://dashboard.pluggy.ai e configure PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET.`
    );
  }
  return { clientId, clientSecret };
}

async function getApiKey(): Promise<string> {
  if (cachedApiKey && cachedApiKey.expiresAt > Date.now()) return cachedApiKey.value;
  const { clientId, clientSecret } = getCredentials();
  const { apiKey } = await pluggyFetch<{ apiKey: string }>("/auth", {
    method: "POST",
    body: JSON.stringify({ clientId, clientSecret }),
  });
  cachedApiKey = { value: apiKey, expiresAt: Date.now() + API_KEY_TTL_MS };
  return apiKey;
}

export async function createConnectToken(oauthRedirectUri?: string): Promise<string> {
  const apiKey = await getApiKey();
  // oauthRedirectUri é obrigatório para conectores baseados em OAuth (ex: MeuPluggy) —
  // sem isso a Pluggy não sabe para onde mandar o usuário de volta após autorizar.
  const { accessToken } = await pluggyFetch<{ accessToken: string }>("/connect_token", {
    method: "POST",
    apiKey,
    body: JSON.stringify({
      options: {
        ...(oauthRedirectUri ? { oauthRedirectUri } : {}),
      },
    }),
  });
  return accessToken;
}

export async function getItem(itemId: string): Promise<PluggyItem> {
  const apiKey = await getApiKey();
  return pluggyFetch<PluggyItem>(`/items/${itemId}`, { apiKey });
}

export async function listAccounts(itemId: string): Promise<PluggyAccount[]> {
  const apiKey = await getApiKey();
  const { results } = await pluggyFetch<{ results: PluggyAccount[] }>(`/accounts?itemId=${itemId}`, { apiKey });
  return results;
}

export async function listInvestments(itemId: string): Promise<PluggyInvestment[]> {
  const apiKey = await getApiKey();
  const all: PluggyInvestment[] = [];
  // Carteiras pessoais têm poucos ativos; o limite de páginas é só uma trava de segurança.
  for (let page = 1; page <= 5; page++) {
    const data = await pluggyFetch<{ results: PluggyInvestment[]; totalPages: number }>(
      `/investments?itemId=${itemId}&page=${page}`,
      { apiKey }
    );
    all.push(...data.results);
    if (page >= data.totalPages) break;
  }
  return all;
}

/**
 * Uma página (até 500) de transações. /transactions (v1) foi descontinuado (410); o v2 usa
 * cursor: `next` vem como querystring pronta, da qual extraímos só o token `after`.
 */
export async function listTransactionsPage(
  accountId: string,
  opts: { dateFrom?: string; after?: string } = {}
): Promise<{ results: PluggyTransaction[]; cursor: string | null }> {
  const apiKey = await getApiKey();
  const params = new URLSearchParams({ accountId });
  if (opts.dateFrom) params.set("dateFrom", opts.dateFrom);
  if (opts.after) params.set("after", opts.after);
  const data = await pluggyFetch<{ results: PluggyTransaction[]; next: string | null }>(
    `/v2/transactions?${params}`,
    { apiKey }
  );
  const cursor = data.next ? new URLSearchParams(data.next).get("after") : null;
  return { results: data.results, cursor };
}
