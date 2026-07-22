import { ExternalLink,Github,Heart,RefreshCcw } from "lucide-react";
import { useState } from "react";

import { getCurrentSession } from "../api/endpoints";
import { normalizeApiError } from "../api/errors";
import { ProxmoxSettingsPanel } from "../components/ProxmoxIntegration";
import { appConfig } from "../config/appConfig";
import { useSettingsStore } from "../store/settingsStore";
import { formatDateTime } from "../utils/format";

import { Info,Panel,maskSensitiveUrl } from "../app/ui";

export function SettingsPage() {
  const [connectionMessage, setConnectionMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const backendConfig = useSettingsStore((state) => state.backendConfig);
  const refreshIntervalSeconds = useSettingsStore((state) => state.refreshIntervalSeconds);
  const setRefreshIntervalSeconds = useSettingsStore((state) => state.setRefreshIntervalSeconds);
  const demoMode = backendConfig?.user.dataMode === "demo";
  const hideSensitiveValues = useSettingsStore((state) => state.hideSensitiveValues);
  const setHideSensitiveValues = useSettingsStore((state) => state.setHideSensitiveValues);
  const testConnection = async () => {
    setConnectionMessage(null);
    if (!backendConfig) {
      setConnectionMessage({ text: "No backend is configured.", tone: "error" });
      return;
    }

    try {
      const session = await getCurrentSession({ backendUrl: backendConfig.backendUrl });
      setConnectionMessage(session.authenticated
        ? { text: `Signed in as ${session.user?.username ?? "NodeGuard user"}.`, tone: "success" }
        : { text: "Session expired. Sign in again.", tone: "error" });
    } catch (error) {
      setConnectionMessage({ text: normalizeApiError(error).message, tone: "error" });
    }
  };

  const exportDiagnostics = () => {
    const diagnostics = {
      generatedAt: new Date().toISOString(),
      backendUrl: backendConfig ? maskSensitiveUrl(backendConfig.backendUrl, hideSensitiveValues) : null,
      username: backendConfig?.user.username ?? null,
      role: backendConfig?.user.role ?? null,
      connectedAt: backendConfig?.connectedAt ?? null,
      refreshIntervalSeconds,
      dataMode: "live",
      hideSensitiveValues
    };
    const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nodeguard-diagnostics.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-stack settings-page">
      <Panel title={demoMode ? "Session" : "Connection"} action={!demoMode ? <button className="secondary-button" onClick={testConnection}><RefreshCcw size={16} /> Test connection</button> : undefined}>
        <div className="settings-content">
          <p className="muted settings-description">{demoMode ? "This account is restricted to isolated fictional Demo Mode data." : "View and verify the active NodeGuard session."}</p>
          <div className="info-grid">
            {!demoMode ? <Info label="Backend URL" value={backendConfig ? maskSensitiveUrl(backendConfig.backendUrl, hideSensitiveValues) : "Not connected"} /> : null}
            <Info label="Signed in as" value={backendConfig?.user.username ?? "Not signed in"} />
            <Info label="Role" value={backendConfig?.user.role ?? "Unavailable"} />
            <Info label="Data mode" value={demoMode ? "Demo only" : "Live only"} />
            <Info label="Session started" value={formatDateTime(backendConfig?.connectedAt ?? null)} />
          </div>
          {connectionMessage ? <div className={`stale-notice ${connectionMessage.tone === "success" ? "success" : ""}`} role={connectionMessage.tone === "error" ? "alert" : "status"}>{connectionMessage.text}</div> : null}
        </div>
      </Panel>
      <Panel title="Monitoring">
        <div className="settings-content">
          <p className="muted settings-description">Choose how often NodeGuard refreshes health checks and live status data.</p>
          <div className="settings-control">
            <h3 className="settings-subheading">Live refresh interval</h3>
            <div className="segmented">
              {[1, 5, 10, 30, 60].map((value) => <button key={value} className={value === refreshIntervalSeconds ? "active" : ""} onClick={() => setRefreshIntervalSeconds(value)}>{value}s</button>)}
            </div>
          </div>
        </div>
      </Panel>
      {!demoMode ? <ProxmoxSettingsPanel /> : null}
      {demoMode ? <Panel title="Demo environment">
        <div className="settings-content"><p className="muted settings-description">Demo Mode is enforced for this account. All pages use isolated fictional infrastructure and cannot switch to Live Mode.</p></div>
      </Panel> : null}
      <Panel title={demoMode ? "Privacy" : "Privacy & Security"}>
        <div className="settings-content">
          <p className="muted settings-description">{demoMode ? "Live backend configuration and production diagnostics are hidden for this account." : "Control what is visible when sharing screenshots of NodeGuard."}</p>
          {!demoMode ? <div className="settings-list"><label><input type="checkbox" checked={hideSensitiveValues} onChange={(event) => setHideSensitiveValues(event.target.checked)} /> Hide backend URL in screenshots</label></div> : null}
        </div>
      </Panel>
      {!demoMode ? <Panel title="Diagnostics">
        <div className="settings-content">
          <div className="settings-inline-action">
            <p className="muted settings-description">Export a sanitized snapshot of this app's local configuration for troubleshooting.</p>
            <button onClick={exportDiagnostics}>Export diagnostics</button>
          </div>
        </div>
      </Panel> : null}
      <Panel title="About NodeGuard">
        <div className="settings-content about-content">
          <p className="muted settings-description">NodeGuard is a self-hosted, read-only infrastructure monitoring platform for Linux servers, Docker containers, domains, updates, alerts, and Proxmox infrastructure. It combines a React dashboard, TypeScript API, SQLite persistence, and a lightweight Go monitoring agent.</p>
          <div className="about-actions">
            <a className="secondary-button compact-action" href="https://github.com/HackintoshMatrix7132/NodeGuard" target="_blank" rel="noreferrer" title="Open NodeGuard on GitHub"><Github size={15} /> GitHub</a>
            {appConfig.supportUrl ? <a
              className="secondary-button compact-action about-support-link"
              href={appConfig.supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Support NodeGuard development on Ko-fi"
              title="Help support NodeGuard development and hosting."
            >
              <Heart size={15} aria-hidden="true" />
              <span>Support NodeGuard</span>
              <ExternalLink size={13} aria-hidden="true" />
            </a> : null}
          </div>
        </div>
      </Panel>
    </div>
  );
}
