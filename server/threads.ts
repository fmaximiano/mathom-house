import { Router, Request, Response } from "express";
import { authMiddleware } from "./auth";

const router = Router();

const THREADS_API = "https://graph.threads.net/v1.0/keyword_search";
const REQUEST_TIMEOUT_MS = 12000; // between 10s and 15s
const MAX_QUERY_LENGTH = 100;
const RESULT_LIMIT = 25;
const FIELDS = "id,text,username,permalink,timestamp,media_type";

// ── In-memory rate limiter: 20 searches / 10 minutes per identity ──
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const rateBuckets = new Map<string, number[]>();

function checkRateLimit(identity: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const hits = (rateBuckets.get(identity) || []).filter((t) => t > windowStart);

  if (hits.length >= RATE_LIMIT_MAX) {
    const retryAfterSec = Math.ceil((hits[0] + RATE_LIMIT_WINDOW_MS - now) / 1000);
    rateBuckets.set(identity, hits);
    return { allowed: false, retryAfterSec: Math.max(retryAfterSec, 1) };
  }

  hits.push(now);
  rateBuckets.set(identity, hits);
  return { allowed: true, retryAfterSec: 0 };
}

// Periodically drop empty/stale buckets to avoid unbounded growth.
setInterval(() => {
  const windowStart = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [key, hits] of rateBuckets) {
    const fresh = hits.filter((t) => t > windowStart);
    if (fresh.length === 0) rateBuckets.delete(key);
    else rateBuckets.set(key, fresh);
  }
}, RATE_LIMIT_WINDOW_MS).unref?.();

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
}

interface NormalizedPost {
  id: string;
  text: string;
  username: string;
  permalink: string;
  timestamp: string;
  mediaType: string;
}

export async function searchHandler(req: Request, res: Response): Promise<void> {
  // Identity for rate limiting: authenticated user id, falling back to IP.
  const user = (req as any).user;
  const identity = user?.id ? `user:${user.id}` : `ip:${getClientIp(req)}`;

  const rate = checkRateLimit(identity);
  if (!rate.allowed) {
    res.setHeader("Retry-After", String(rate.retryAfterSec));
    res.status(429).json({
      error: "Você atingiu o limite de buscas. Tente novamente mais tarde.",
    });
    return;
  }

  // ── Validate input ──
  const body = req.body ?? {};
  const rawQuery = typeof body.query === "string" ? body.query : "";
  const query = rawQuery.trim();

  if (!query) {
    res.status(400).json({ error: "Informe uma palavra-chave para pesquisar." });
    return;
  }
  if (query.length > MAX_QUERY_LENGTH) {
    res.status(400).json({
      error: `A palavra-chave deve ter no máximo ${MAX_QUERY_LENGTH} caracteres.`,
    });
    return;
  }

  // searchType: accept only RECENT or TOP, default RECENT. Ignore anything else.
  const rawType = typeof body.searchType === "string" ? body.searchType.toUpperCase() : "";
  if (rawType && rawType !== "RECENT" && rawType !== "TOP") {
    res.status(400).json({ error: "Tipo de busca inválido." });
    return;
  }
  const searchType = rawType === "TOP" ? "TOP" : "RECENT";

  // Any client-supplied token is ignored entirely — never trusted.
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  if (!accessToken) {
    res.status(503).json({ error: "A integração com o Threads não está configurada." });
    return;
  }

  // ── Build the external request safely (no unsafe string concatenation) ──
  const url = new URL(THREADS_API);
  const params = new URLSearchParams({
    q: query,
    search_type: searchType,
    fields: FIELDS,
    limit: String(RESULT_LIMIT),
    access_token: accessToken,
  });
  url.search = params.toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const apiResp = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    let payload: any = null;
    try {
      payload = await apiResp.json();
    } catch {
      // Body was not valid JSON — treat as unexpected response.
      res.status(502).json({ error: "Não foi possível concluir a busca." });
      return;
    }

    if (!apiResp.ok || payload?.error) {
      const metaError = payload?.error || {};
      const code = Number(metaError.code);
      const subcode = Number(metaError.error_subcode);

      // Log server-side only, without token or raw URL.
      console.error(
        `[Threads] API error status=${apiResp.status} code=${metaError.code ?? "?"} subcode=${
          metaError.error_subcode ?? "?"
        }`
      );

      // Invalid / expired / revoked token.
      if (
        apiResp.status === 401 ||
        code === 190 ||
        [102, 463, 464, 467, 492].includes(subcode)
      ) {
        res.status(401).json({ error: "O token do Threads expirou ou foi revogado." });
        return;
      }
      // Insufficient permission.
      if (apiResp.status === 403 || [10, 200, 803].includes(code)) {
        res.status(403).json({
          error:
            "A integração com o Threads não tem permissão suficiente para esta busca.",
        });
        return;
      }
      // Rate limited by Meta.
      if (apiResp.status === 429 || [4, 17, 32, 613].includes(code)) {
        res.status(429).json({ error: "A Meta limitou temporariamente as requisições." });
        return;
      }
      // Meta-side unavailability.
      if (apiResp.status >= 500) {
        res.status(502).json({
          error: "O serviço do Threads está temporariamente indisponível.",
        });
        return;
      }
      // Anything else → generic.
      res.status(502).json({ error: "Não foi possível concluir a busca." });
      return;
    }

    // ── Normalize the successful response ──
    const rawData = Array.isArray(payload?.data) ? payload.data : [];
    const data: NormalizedPost[] = rawData
      .filter((item: any) => item && typeof item === "object")
      .map((item: any) => ({
        id: typeof item.id === "string" ? item.id : "",
        text: typeof item.text === "string" ? item.text : "",
        username: typeof item.username === "string" ? item.username : "",
        permalink: typeof item.permalink === "string" ? item.permalink : "",
        timestamp: typeof item.timestamp === "string" ? item.timestamp : "",
        mediaType: typeof item.media_type === "string" ? item.media_type : "TEXT",
      }));

    res.json({ data });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      res.status(504).json({
        error: "A busca demorou mais do que o esperado. Tente novamente.",
      });
      return;
    }
    // Network failure / unexpected — never leak internals.
    console.error("[Threads] Request failed:", err?.name || "unknown error");
    res.status(502).json({
      error: "O serviço do Threads está temporariamente indisponível.",
    });
  } finally {
    clearTimeout(timeout);
  }
}

// ── POST /api/threads/search (authentication enforced first) ──
router.post("/search", authMiddleware as any, searchHandler);

export default router;
