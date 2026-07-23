import { Bell,Boxes,Gauge,Globe2,LogOut,PackageOpen,PanelLeftClose,PanelLeftOpen,RadioTower,Server,Settings } from "lucide-react";
import { useEffect,useRef,useState,type TransitionEvent } from "react";

import { logout as logoutSession } from "../api/endpoints";
import { ProxmoxIcon } from "../components/ProxmoxIcon";
import { ProxmoxNodeDetailPage,ProxmoxPage } from "../components/ProxmoxIntegration";
import { useSettingsStore } from "../store/settingsStore";
import { parseProxmoxNodeLocation,proxmoxNodePath,type ProxmoxNodeRoute } from "../utils/proxmoxNodeRoute";

import { AgentsPage } from "../pages/AgentsPage";
import { AlertsPage } from "../pages/AlertsPage";
import { ConnectScreen } from "../pages/ConnectScreen";
import { ContainersPage } from "../pages/ContainersPage";
import { Dashboard } from "../pages/Dashboard";
import { DomainsPage } from "../pages/DomainsPage";
import { ServerPage } from "../pages/MachinesPage";
import { SettingsPage } from "../pages/SettingsPage";
import { UpdatesNavLabel,UpdatesPage } from "../pages/UpdatesPage";
import type { View } from "./types";
import { LogoMark } from "./ui";

export function App() {
  const initialProxmoxNodeRoute = typeof window === "undefined" ? null : parseProxmoxNodeLocation(window.location);
  const [view, setView] = useState<View>(() => initialProxmoxNodeRoute ? "proxmox-node" : window.location.pathname === "/proxmox" ? "proxmox" : "dashboard");
  const [proxmoxNodeRoute, setProxmoxNodeRoute] = useState<ProxmoxNodeRoute | null>(initialProxmoxNodeRoute);
  const [containerHostFilter, setContainerHostFilter] = useState<string | null>(null);
  const [pendingUpdateMachineId, setPendingUpdateMachineId] = useState<string | null>(null);
  const [isNavigationDrawer, setIsNavigationDrawer] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 980px)").matches);
  const [isNavigationDrawerOpen, setIsNavigationDrawerOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logoutTimer = useRef<number | null>(null);
  const sidebarRevealRef = useRef<HTMLButtonElement>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const focusRevealAfterClose = useRef(false);
  const backendConfig = useSettingsStore((state) => state.backendConfig);
  const demoMode = useSettingsStore((state) => state.demoMode);
  const load = useSettingsStore((state) => state.load);
  const disconnect = useSettingsStore((state) => state.disconnect);
  const sidebarDesktopCollapsed = useSettingsStore((state) => state.sidebarDesktopCollapsed);
  const setSidebarDesktopCollapsed = useSettingsStore((state) => state.setSidebarDesktopCollapsed);

  useEffect(() => {
    load();

    const restoreLocation = () => {
      const route = parseProxmoxNodeLocation(window.location);
      if (route) {
        setProxmoxNodeRoute(route);
        setView("proxmox-node");
      } else if (window.location.pathname === "/proxmox") {
        setProxmoxNodeRoute(null);
        setView("proxmox");
      } else if (window.location.pathname === "/") {
        setProxmoxNodeRoute(null);
        setView("dashboard");
      }
    };
    window.addEventListener("popstate", restoreLocation);

    return () => {
      window.removeEventListener("popstate", restoreLocation);
      if (logoutTimer.current) {
        window.clearTimeout(logoutTimer.current);
      }
    };
  }, [load]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 980px)");
    const updateNavigationMode = () => {
      if (media.matches) {
        const sidebar = document.getElementById("primary-sidebar");
        if (document.activeElement instanceof HTMLElement && sidebar?.contains(document.activeElement)) {
          document.activeElement.blur();
        }
      }
      setIsNavigationDrawer(media.matches);
      setIsNavigationDrawerOpen(false);
      focusRevealAfterClose.current = false;
    };
    updateNavigationMode();
    media.addEventListener("change", updateNavigationMode);
    return () => media.removeEventListener("change", updateNavigationMode);
  }, []);

  const nav = [
    ["dashboard", Gauge, "Dashboard"],
    ["server", Server, "Machines"],
    ["proxmox", ProxmoxIcon, "Proxmox"],
    ["agents", RadioTower, "Agents"],
    ["containers", Boxes, "Containers"],
    ["domains", Globe2, "Domains"],
    ["updates", PackageOpen, "Updates"],
    ["alerts", Bell, "Alerts"],
    ["settings", Settings, "Settings"]
  ] as const;
  const activeNavItem = nav.find(([key]) => key === (view === "proxmox-node" ? "proxmox" : view));
  const ActiveIcon = activeNavItem?.[1] ?? Gauge;
  const activeLabel = view === "proxmox-node" ? "Proxmox node" : activeNavItem?.[2] ?? "Dashboard";

  const logout = () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    logoutTimer.current = window.setTimeout(() => {
      if (backendConfig) {
        void logoutSession({ backendUrl: backendConfig.backendUrl }).catch(() => null);
      }
      disconnect();
      setIsLoggingOut(false);
    }, 260);
  };

  const selectView = (nextView: View) => {
    setView(nextView);
    setProxmoxNodeRoute(null);
    const path = nextView === "proxmox" ? "/proxmox" : "/";
    if (window.location.pathname !== path || window.location.search) window.history.pushState({}, "", path);
    window.scrollTo({ top: 0, behavior: "auto" });
    if (isNavigationDrawer) {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      focusRevealAfterClose.current = true;
      setIsNavigationDrawerOpen(false);
    }
  };

  const openProxmoxNode = (connectionId: string, node: string) => {
    const route: ProxmoxNodeRoute = { connectionId, node, tab: "overview", range: "24h" };
    setProxmoxNodeRoute(route);
    setView("proxmox-node");
    window.history.pushState({}, "", proxmoxNodePath(route));
  };

  const updateProxmoxNodeRoute = (patch: Partial<Pick<ProxmoxNodeRoute, "tab" | "range">>, replace = false) => {
    setProxmoxNodeRoute((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      window.history[replace ? "replaceState" : "pushState"]({}, "", proxmoxNodePath(next));
      return next;
    });
  };

  const closeProxmoxNode = () => {
    setProxmoxNodeRoute(null);
    setView("proxmox");
    window.history.pushState({}, "", "/proxmox");
  };

  const openNavigationDrawer = () => {
    const revealButton = sidebarRevealRef.current;
    if (document.activeElement === revealButton) revealButton?.blur();
    focusRevealAfterClose.current = false;
    setIsNavigationDrawerOpen(true);
    window.requestAnimationFrame(() => sidebarToggleRef.current?.focus({ preventScroll: true }));
  };

  const closeNavigationDrawer = () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    focusRevealAfterClose.current = true;
    setIsNavigationDrawerOpen(false);
  };

  const toggleDesktopSidebar = () => setSidebarDesktopCollapsed(!sidebarDesktopCollapsed);

  const handleSidebarTransitionEnd = (event: TransitionEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== "transform") return;
    if (!isNavigationDrawer || isNavigationDrawerOpen || !focusRevealAfterClose.current) return;

    focusRevealAfterClose.current = false;
    sidebarRevealRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!isNavigationDrawer || !isNavigationDrawerOpen) return;

    const previousOverflow = document.body.style.overflow;
    const sidebar = document.getElementById("primary-sidebar");
    const focusableSelector = "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeNavigationDrawer();
        return;
      }
      if (event.key !== "Tab" || !sidebar) return;
      const focusable = Array.from(sidebar.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => sidebarToggleRef.current?.focus({ preventScroll: true }));
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNavigationDrawer, isNavigationDrawerOpen]);

  useEffect(() => {
    if (!isNavigationDrawer || isNavigationDrawerOpen || !focusRevealAfterClose.current) return;
    const timeout = window.setTimeout(() => {
      if (!focusRevealAfterClose.current) return;
      focusRevealAfterClose.current = false;
      sidebarRevealRef.current?.focus({ preventScroll: true });
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [isNavigationDrawer, isNavigationDrawerOpen]);

  if (!backendConfig && !demoMode) return <ConnectScreen />;

  return (
    <div className={`app-shell ${!isNavigationDrawer && sidebarDesktopCollapsed ? "sidebar-rail" : ""} ${isNavigationDrawer ? "has-navigation-drawer" : ""} ${isNavigationDrawerOpen ? "navigation-drawer-open" : ""} ${isLoggingOut ? "logging-out" : ""}`}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <div className="sidebar-slot">
        <button className="sidebar-backdrop" onClick={closeNavigationDrawer} aria-label="Close navigation" tabIndex={-1} />
        <aside
          id="primary-sidebar"
          className="sidebar"
          aria-hidden={isNavigationDrawer && !isNavigationDrawerOpen ? true : undefined}
          aria-label="NodeGuard navigation"
          aria-modal={isNavigationDrawer && isNavigationDrawerOpen ? true : undefined}
          inert={isNavigationDrawer && !isNavigationDrawerOpen ? true : undefined}
          onTransitionEnd={handleSidebarTransitionEnd}
          role={isNavigationDrawer ? "dialog" : undefined}
        >
        <div className="sidebar-top">
          <div className="brand"><LogoMark className="brand-logo" /><span className="sidebar-brand-label">NodeGuard</span></div>
          <button
            ref={sidebarToggleRef}
            className="sidebar-toggle"
            onClick={isNavigationDrawer ? closeNavigationDrawer : toggleDesktopSidebar}
            aria-label={isNavigationDrawer ? "Close navigation" : sidebarDesktopCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-controls="primary-sidebar"
            aria-expanded={isNavigationDrawer ? isNavigationDrawerOpen : !sidebarDesktopCollapsed}
          >
            {isNavigationDrawer || !sidebarDesktopCollapsed ? <PanelLeftClose size={18} aria-hidden="true" /> : <PanelLeftOpen size={18} aria-hidden="true" />}
          </button>
        </div>
        <nav aria-label="Primary navigation">{nav.map(([key, Icon, label]) => { const active = view === key || (key === "proxmox" && view === "proxmox-node"); return <button key={key} className={`sidebar-nav-item ${active ? "active" : ""}`} aria-label={label} aria-current={active ? "page" : undefined} onClick={() => selectView(key)}><Icon size={18} aria-hidden="true" /><span className="sidebar-nav-label">{key === "updates" ? <UpdatesNavLabel /> : label}</span></button>; })}</nav>
        <button className="sidebar-logout" aria-label="Logout" onClick={logout} disabled={isLoggingOut}><LogOut size={18} aria-hidden="true" /><span className="sidebar-action-label">{isLoggingOut ? "Logging out" : "Logout"}</span></button>
        </aside>
      </div>
      <main className="workspace" id="main-content" inert={isNavigationDrawer && isNavigationDrawerOpen ? true : undefined} tabIndex={-1}>
        <header className="workspace-topbar">
          <button
            ref={sidebarRevealRef}
            className="sidebar-reveal"
            onClick={openNavigationDrawer}
            aria-label="Open navigation"
            title="Open navigation"
            aria-controls="primary-sidebar"
            aria-expanded={isNavigationDrawerOpen}
            aria-hidden={!isNavigationDrawer || isNavigationDrawerOpen}
            tabIndex={isNavigationDrawer && !isNavigationDrawerOpen ? 0 : -1}
          >
            <PanelLeftOpen size={18} aria-hidden="true" />
          </button>
          <div className="topbar-title">
            <span><ActiveIcon size={16} aria-hidden="true" /></span>
            <h1>{activeLabel}</h1>
          </div>
          <div className="topbar-status">
            <span>{demoMode ? "Environment" : backendConfig ? "Connected" : "Local"}</span>
            <span className={`environment-badge ${demoMode ? "is-demo" : "is-live"}`}>{demoMode ? "Demo" : "Live"}</span>
          </div>
        </header>
        {view === "dashboard" && <Dashboard setView={setView} />}
        {view === "server" && <ServerPage />}
        {view === "proxmox" && <ProxmoxPage onViewNode={openProxmoxNode} />}
        {view === "proxmox-node" && proxmoxNodeRoute ? <ProxmoxNodeDetailPage connectionId={proxmoxNodeRoute.connectionId} node={proxmoxNodeRoute.node} tab={proxmoxNodeRoute.tab} range={proxmoxNodeRoute.range} onBack={closeProxmoxNode} onTabChange={(tab) => updateProxmoxNodeRoute({ tab })} onRangeChange={(range) => updateProxmoxNodeRoute({ range }, true)} /> : null}
        {view === "agents" && <AgentsPage onOpenContainers={(agentId) => { setContainerHostFilter(agentId); setView("containers"); }} onOpenUpdates={(agentId) => { setPendingUpdateMachineId(agentId); setView("updates"); }} />}
        {view === "containers" && <ContainersPage initialHostId={containerHostFilter} onHostFilterApplied={() => setContainerHostFilter(null)} />}
        {view === "domains" && <DomainsPage />}
        {view === "updates" && <UpdatesPage initialMachineId={pendingUpdateMachineId} onInitialMachineApplied={() => setPendingUpdateMachineId(null)} />}
        {view === "alerts" && <AlertsPage />}
        {view === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
