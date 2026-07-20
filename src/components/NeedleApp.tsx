import { useState, useEffect, useCallback, FormEvent } from "react";
import "./NeedleApp.css";

type SearchType = "RECENT" | "TOP";

interface ThreadsPost {
  id: string;
  text: string;
  username: string;
  permalink: string;
  timestamp: string;
  mediaType: string;
}

type AuthState = "checking" | "login" | "2fa" | "authenticated" | "error";

const MEDIA_LABELS: Record<string, string> = {
  TEXT: "Texto",
  TEXT_POST: "Texto",
  IMAGE: "Imagem",
  VIDEO: "Vídeo",
  CAROUSEL_ALBUM: "Álbum",
  AUDIO: "Áudio",
  REPOST_FACADE: "Republicação",
};

function mediaLabel(type: string): string {
  return MEDIA_LABELS[type] || (type ? type.replace(/_/g, " ") : "Publicação");
}

function formatTimestamp(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export default function NeedleApp() {
  const [auth, setAuth] = useState<AuthState>("checking");

  const checkAuth = useCallback(async () => {
    try {
      const resp = await fetch("/api/auth/me", { signal: AbortSignal.timeout(10000) });
      setAuth(resp.ok ? "authenticated" : "login");
    } catch {
      setAuth("error");
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <div className="needle-app">
      <header className="needle-header">
        <div className="needle-header__inner">
          <h1 className="needle-brand">
            NEEDLE
            <span className="needle-brand__full">
              Network Exploration Engine for Detecting Latent Engagement
            </span>
          </h1>
        </div>
      </header>

      <main className="needle-main" id="conteudo">
        {auth === "checking" && (
          <p className="needle-loading" role="status">
            <span className="needle-spinner" aria-hidden="true" />
            Verificando acesso…
          </p>
        )}

        {auth === "error" && (
          <div className="needle-status">
            <p className="needle-error" role="alert">
              <span className="needle-error__icon" aria-hidden="true">
                !
              </span>
              Não foi possível verificar seu acesso. Recarregue a página e tente
              novamente.
            </p>
          </div>
        )}

        {(auth === "login" || auth === "2fa") && (
          <LoginGate
            stage={auth}
            onStage={setAuth}
            onAuthenticated={() => setAuth("authenticated")}
          />
        )}

        {auth === "authenticated" && <SearchPanel />}
      </main>

      <footer className="needle-footer">
        <div className="needle-footer__inner">
          <nav aria-label="Páginas institucionais do NEEDLE">
            <ul>
              <li>
                <a href="/needle/privacy/">Política de Privacidade</a>
              </li>
              <li>
                <a href="/needle/data-deletion/">Exclusão de Dados</a>
              </li>
              <li>
                <a href="/needle/terms/">Termos de Uso</a>
              </li>
            </ul>
          </nav>
          <p style={{ margin: 0 }}>
            NEEDLE — ferramenta de apoio à pesquisa de conteúdos do Threads. O
            NEEDLE não publica respostas automaticamente.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ── Login gate: reuses the existing /api/auth session endpoints ──
function LoginGate({
  stage,
  onStage,
  onAuthenticated,
}: {
  stage: "login" | "2fa";
  onStage: (s: AuthState) => void;
  onAuthenticated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [tempToken, setTempToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Informe e-mail e senha.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Não foi possível entrar.");
        return;
      }
      if (data.requires2FA) {
        setTempToken(data.tempToken);
        onStage("2fa");
        return;
      }
      onAuthenticated();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify2FA(e: FormEvent) {
    e.preventDefault();
    if (!code) {
      setError("Informe o código de verificação.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/auth/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, tempToken }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Código inválido.");
        return;
      }
      onAuthenticated();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="needle-card needle-gate" aria-labelledby="needle-gate-title">
      <h2 id="needle-gate-title">Acesso restrito</h2>
      <p className="needle-gate__hint">
        Esta aplicação é de uso restrito. Autentique-se para continuar.
      </p>

      {stage === "login" ? (
        <form className="needle-form" onSubmit={handleLogin} noValidate>
          <div className="needle-field">
            <label htmlFor="needle-email">E-mail</label>
            <input
              id="needle-email"
              type="email"
              autoComplete="username"
              value={email}
              disabled={loading}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="needle-field">
            <label htmlFor="needle-password">Senha</label>
            <input
              id="needle-password"
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={loading}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="needle-btn" type="submit" disabled={loading}>
            {loading && <span className="needle-spinner" aria-hidden="true" />}
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      ) : (
        <form className="needle-form" onSubmit={handleVerify2FA} noValidate>
          <div className="needle-field">
            <label htmlFor="needle-2fa">Código de verificação (2FA)</label>
            <input
              id="needle-2fa"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              disabled={loading}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <button className="needle-btn" type="submit" disabled={loading}>
            {loading && <span className="needle-spinner" aria-hidden="true" />}
            {loading ? "Verificando…" : "Verificar"}
          </button>
        </form>
      )}

      <div className="needle-status" aria-live="assertive">
        {error && (
          <p className="needle-error" role="alert">
            <span className="needle-error__icon" aria-hidden="true">
              !
            </span>
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

// ── Search panel (authenticated) ──
function SearchPanel() {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("RECENT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<ThreadsPost[] | null>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError("Informe uma palavra-chave para pesquisar.");
      setResults(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/threads/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, searchType }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || "Não foi possível concluir a busca.");
        setResults(null);
        return;
      }
      setResults(Array.isArray(data.data) ? data.data : []);
    } catch {
      setError("Não foi possível concluir a busca. Verifique sua conexão.");
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  const hasResults = results !== null && results.length > 0;
  const noResults = results !== null && results.length === 0 && !error;

  return (
    <>
      <p className="needle-intro">
        Pesquise publicações do Threads por palavra-chave para identificar
        conversas potencialmente relevantes. A decisão de interagir permanece
        sempre com o usuário.
      </p>
      <p className="needle-note">O NEEDLE não publica respostas automaticamente.</p>

      <section className="needle-card" aria-labelledby="needle-search-title">
        <h2 id="needle-search-title" className="needle-visually-hidden">
          Pesquisar publicações
        </h2>
        <form className="needle-form" onSubmit={handleSearch} noValidate>
          <div className="needle-field">
            <label htmlFor="needle-query">Palavra-chave</label>
            <input
              id="needle-query"
              type="text"
              maxLength={100}
              placeholder="Ex.: NeedleApp"
              value={query}
              disabled={loading}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="needle-field">
            <label htmlFor="needle-type">Tipo de resultados</label>
            <select
              id="needle-type"
              value={searchType}
              disabled={loading}
              onChange={(e) => setSearchType(e.target.value as SearchType)}
            >
              <option value="RECENT">Recentes</option>
              <option value="TOP">Populares</option>
            </select>
          </div>
          <button className="needle-btn" type="submit" disabled={loading}>
            {loading && <span className="needle-spinner" aria-hidden="true" />}
            {loading ? "Pesquisando…" : "Pesquisar no Threads"}
          </button>
        </form>
      </section>

      <div className="needle-status" aria-live="polite">
        {loading && (
          <p className="needle-loading">
            <span className="needle-spinner" aria-hidden="true" />
            Buscando publicações no Threads…
          </p>
        )}

        {!loading && error && (
          <p className="needle-error" role="alert">
            <span className="needle-error__icon" aria-hidden="true">
              !
            </span>
            {error}
          </p>
        )}

        {!loading && noResults && (
          <p className="needle-empty">Nenhum resultado encontrado.</p>
        )}
      </div>

      {!loading && hasResults && (
        <>
          <p className="needle-count" role="status">
            {results!.length}{" "}
            {results!.length === 1 ? "resultado encontrado" : "resultados encontrados"}
          </p>
          <ul className="needle-results">
            {results!.map((post, idx) => (
              <li className="needle-result" key={post.id || idx}>
                <div className="needle-result__head">
                  <span className="needle-result__user">
                    {post.username ? `@${post.username}` : "Usuário desconhecido"}
                  </span>
                  <span className="needle-result__badge">
                    {mediaLabel(post.mediaType)}
                  </span>
                  {post.timestamp && (
                    <span className="needle-result__time">
                      {formatTimestamp(post.timestamp)}
                    </span>
                  )}
                </div>
                {post.text && <p className="needle-result__text">{post.text}</p>}
                {post.permalink && (
                  <a
                    className="needle-result__link"
                    href={post.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir no Threads ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
