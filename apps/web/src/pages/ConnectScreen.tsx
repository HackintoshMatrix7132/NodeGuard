import { Eye,EyeOff,KeyRound } from "lucide-react";
import { useState } from "react";

import { getDefaultBackendUrl } from "../api/client";
import { normalizeApiError } from "../api/errors";
import {
  useLogin
} from "../hooks/useNodeGuardQueries";
import { useSettingsStore } from "../store/settingsStore";

import { LogoMark } from "../app/ui";

export function ConnectScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveSession = useSettingsStore((state) => state.saveSession);
  const login = useLogin();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    try {
      const backendUrl = getDefaultBackendUrl();
      if (!username.trim() || !password) {
        setError("Enter your username and password.");
        return;
      }
      const session = await login.mutateAsync({
        config: { backendUrl },
        input: { username: username.trim(), password, rememberMe }
      });
      if (!session.authenticated || !session.user) {
        setError("Invalid username or password.");
        return;
      }
      saveSession(backendUrl, session.user);
    } catch (caught) {
      const apiError = normalizeApiError(caught);
      setError(apiError.code === "missing_api_key"
        ? "Your backend is still running the old API-key build. Stop the API server and start it again so the new username/password login routes are active."
        : apiError.message);
    }
  };

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="logo-mark"><LogoMark className="logo-mark-img" label="NodeGuard logo" /></div>
        <h1>Welcome to NodeGuard</h1>
        <p>Enter your credentials to continue.</p>
        <aside className="demo-login-card" aria-label="Demo Mode credentials">
          <span className="demo-login-icon"><KeyRound size={17} /></span>
          <span><strong>Demo Mode</strong><small>Login with <code>demo</code> / <code>demo</code></small></span>
        </aside>
        {error ? <div className="login-error" id="login-error" role="alert"><strong>Sign in failed</strong><span>{error}</span></div> : null}
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="Username" aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} />
        </label>
        <label>
          Password
          <span className={`password-field ${showPassword ? "is-visible" : ""}`}>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter password"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "login-error" : undefined}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              <span key={showPassword ? "hide" : "show"} className="password-toggle-icon">
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </span>
            </button>
          </span>
        </label>
        <label className="remember-option">
          <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
          <span>Remember me</span>
        </label>
        <button type="submit" disabled={login.isPending}>{login.isPending ? "Signing in..." : "Sign in to NodeGuard"}</button>
      </form>
    </main>
  );
}
