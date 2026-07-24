import { e2eApiUrl, expect, expectNoHorizontalOverflow, signIn, test } from "./fixtures";

test("demo login, refresh, and primary desktop navigation stay healthy", async ({ page }) => {
  await signIn(page, "demo", "demo");
  await expect(page.getByRole("heading", { name: "Active issues", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Refresh successful at" })).toBeVisible();

  const destinations = [
    ["Machines", "Monitored machines"],
    ["Proxmox", "Connections"],
    ["Agents", "Linux agents"],
    ["Containers", "Docker containers"],
    ["Domains", "Domains / services"],
    ["Updates", "Update Center"],
    ["Alerts", "Active alerts"],
    ["Settings", "About NodeGuard"],
  ] as const;

  for (const [navigationLabel, contentHeading] of destinations) {
    await page.getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: navigationLabel, exact: navigationLabel !== "Updates" })
      .click();
    await expect(page.getByRole("heading", { name: navigationLabel, level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: contentHeading, exact: true }).first()).toBeVisible();
  }

  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Containers", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Search containers" }).fill("postgres");
  const postgresRow = page.locator(".container-table-row").filter({ hasText: "postgres" });
  await postgresRow.getByRole("button", { name: "View details for postgres" }).click();
  await expect(page.locator(".container-detail-target")).toContainText("Photos VM");
  await expect(page.locator(".container-table-scroll")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("Proxmox node navigation, tabs, and history charts use restrained accessible motion", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "demo", "demo");
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Proxmox", exact: true })
    .click();

  const eyeButton = page.getByRole("button", { name: "View details for pve-a" });
  await expect(eyeButton).toHaveAttribute("title", "View node details");
  await eyeButton.click();
  await expect(page).toHaveURL(/\/proxmox\/nodes\/demo-pve-main\/pve-a$/);
  await expect(page.getByRole("heading", { name: "pve-a", level: 2 })).toBeVisible();

  const heading = page.locator(".proxmox-node-heading");
  const cards = page.locator(".proxmox-node-detail-card");
  await expect(heading).toHaveCSS("animation-name", "proxmoxNodeShellIn");
  await expect(heading).toHaveCSS("animation-duration", "0.21s");
  await expect(cards).toHaveCount(7);
  await expect(cards.first()).toHaveCSS("animation-name", "proxmoxNodeCardIn");
  await expect(cards.nth(6)).toHaveCSS("animation-delay", "0.144s");

  const overviewTab = page.getByRole("tab", { name: "Overview" });
  const historyTab = page.getByRole("tab", { name: "History" });
  await expect(overviewTab).toHaveAttribute("aria-selected", "true");
  await expect(historyTab).toHaveAttribute("aria-controls", "proxmox-node-history");
  await historyTab.click();
  await expect(historyTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "History" })).toBeVisible();
  await expect(page.getByRole("tabpanel")).toHaveCount(1);

  const historyPaths = page.locator(".proxmox-chart-line");
  await expect(historyPaths).toHaveCount(7);
  for (const path of await historyPaths.all()) {
    await expect(path).toHaveAttribute("pathLength", "1");
    await expect(path).toHaveCSS("animation-name", "historyLineReveal");
    await expect(path).toHaveCSS("animation-duration", "0.68s");
  }
  const unavailablePanel = page.locator(".proxmox-history-chart-card--unavailable");
  await expect(unavailablePanel).toContainText("Temperature history is not exposed by this node.");
  await expect(unavailablePanel.locator(".proxmox-chart-line")).toHaveCount(0);

  await page.evaluate(() => {
    document.documentElement.dataset.historyLineStarts = "0";
    document.addEventListener("animationstart", (event) => {
      if ((event as AnimationEvent).animationName === "historyLineReveal") {
        const current = Number(document.documentElement.dataset.historyLineStarts ?? "0");
        document.documentElement.dataset.historyLineStarts = String(current + 1);
      }
    });
  });
  const historyRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/proxmox/connections/") && request.url().includes("/history?")) {
      historyRequests.push(request.url());
    }
  });
  await page.getByRole("combobox", { name: "History range" }).click();
  await page.getByRole("option", { name: "6 hours" }).click();
  await expect(page).toHaveURL(/[?&]range=6h/);
  await expect.poll(() => historyRequests.filter((url) => url.includes("range=6h")).length).toBe(1);
  await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.historyLineStarts ?? "0"))).toBe(7);

  await overviewTab.click();
  await expect(page.getByRole("tabpanel", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await historyTab.click();
  await expect(page.getByRole("tabpanel", { name: "History" })).toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.getByRole("tabpanel", { name: "History" })).toBeVisible();
  await expect(page.locator(".proxmox-node-heading")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".proxmox-chart-line").first()).toHaveCSS("animation-name", "none");
  await expect(page.locator(".proxmox-chart-line").first()).toHaveCSS("stroke-dashoffset", "0px");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "History" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("desktop sidebar becomes a persistent accessible rail while narrow screens use a temporary drawer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    if (!localStorage.getItem("nodeguard.preferences")) {
      localStorage.setItem("nodeguard.preferences", JSON.stringify({
        hideSensitiveValues: true,
        refreshIntervalSeconds: 60,
        sidebarDesktopCollapsed: false,
      }));
    }
  });
  await signIn(page, "demo", "demo");

  const shell = page.locator(".app-shell");
  const sidebar = page.getByRole("complementary", { name: "NodeGuard navigation" });
  const workspace = page.locator(".workspace");
  const expandedWorkspaceWidth = (await workspace.boundingBox())?.width ?? 0;
  await expect(shell).not.toHaveClass(/sidebar-rail/);
  await expect(page.getByText("NodeGuard", { exact: true }).first()).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(shell).toHaveCSS("transition-duration", /^(0\.001ms|1e-06s)$/);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(shell).toHaveClass(/sidebar-rail/);
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await expect(sidebar).not.toHaveAttribute("aria-hidden", "true");
  await expect(sidebar).not.toHaveAttribute("inert", "");
  await expect(page.locator(".sidebar-brand-label")).toHaveCSS("visibility", "hidden");
  await expect(page.locator(".sidebar-brand-label")).toHaveCSS("width", "0px");
  await expect(page.locator(".sidebar-nav-label").first()).toHaveCSS("visibility", "hidden");
  await expect(page.locator(".sidebar-nav-label").first()).toHaveCSS("width", "0px");
  await expect(page.locator(".sidebar-action-label")).toHaveCSS("width", "0px");
  await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  await expect(page.locator(".brand")).not.toHaveAttribute("title");
  await expect(page.getByRole("button", { name: "Expand sidebar" })).not.toHaveAttribute("title");
  await expect(page.locator("#primary-sidebar [data-tooltip]")).toHaveCount(0);
  expect((await workspace.boundingBox())?.width ?? 0).toBeGreaterThan(expandedWorkspaceWidth + 150);
  await expectNoHorizontalOverflow(page);

  const railControls = sidebar.getByRole("button");
  await expect(railControls).toHaveCount(11);
  for (const control of await railControls.all()) {
    await expect(control).toHaveAttribute("aria-label", /.+/);
    await expect(control).not.toHaveAttribute("title");
    await control.hover();
    await expect.poll(() => control.evaluate((element) => getComputedStyle(element, "::after").content)).toBe("none");
    await expect(page.locator('[role="tooltip"]')).toHaveCount(0);
  }

  const dashboardButton = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: "Dashboard" });
  await expect(dashboardButton).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Expand sidebar" }).focus();
  for (let index = 0; index < await railControls.count(); index += 1) {
    await expect(railControls.nth(index)).toBeFocused();
    await expect.poll(() => railControls.nth(index).evaluate((element) => getComputedStyle(element, "::after").content)).toBe("none");
    await expect(page.locator('[role="tooltip"]')).toHaveCount(0);
    if (index < await railControls.count() - 1) await page.keyboard.press("Tab");
  }

  const persistedCollapsed = await page.evaluate(() => JSON.parse(localStorage.getItem("nodeguard.preferences") ?? "{}") as { sidebarDesktopCollapsed?: boolean });
  expect(persistedCollapsed.sidebarDesktopCollapsed).toBe(true);
  await page.reload();
  await expect(shell).toHaveClass(/sidebar-rail/);

  const destinations = [
    ["Dashboard", "Dashboard"],
    ["Machines", "Machines"],
    ["Proxmox", "Proxmox"],
    ["Agents", "Agents"],
    ["Containers", "Containers"],
    ["Domains", "Domains"],
    ["Updates", "Updates"],
    ["Alerts", "Alerts"],
    ["Settings", "Settings"],
  ] as const;
  for (const [navigationLabel, heading] of destinations) {
    await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: navigationLabel, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await expect(shell).toHaveClass(/sidebar-rail/);
  }

  await page.setViewportSize({ width: 900, height: 800 });
  await expect(shell).toHaveClass(/has-navigation-drawer/);
  await expect(shell).not.toHaveClass(/sidebar-rail/);
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Open navigation" }).click();
  const drawer = page.getByRole("dialog", { name: "NodeGuard navigation" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute("aria-modal", "true");
  await expect(page.locator(".workspace")).toHaveAttribute("inert", "");
  await expect(drawer.getByRole("button", { name: "Close navigation" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(drawer.getByRole("button", { name: "Logout" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();

  await page.getByRole("button", { name: "Open navigation" }).click();
  await drawer.getByRole("button", { name: "Dashboard" }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("nodeguard.preferences") ?? "{}") as { sidebarDesktopCollapsed?: boolean })).sidebarDesktopCollapsed).toBe(true);

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(shell).toHaveClass(/sidebar-rail/);
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(shell).not.toHaveClass(/sidebar-rail/);
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("nodeguard.preferences") ?? "{}") as { sidebarDesktopCollapsed?: boolean })).sidebarDesktopCollapsed).toBe(false);
});

test("domain row actions stay compact, accessible, and non-destructive", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("nodeguard.preferences", JSON.stringify({
      hideSensitiveValues: true,
      refreshIntervalSeconds: 60,
    }));
  });
  await signIn(page, "demo", "demo");
  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Domains", exact: true })
    .click();

  const rows = page.locator(".domain-entry");
  await expect(rows).toHaveCount(9);
  for (const row of await rows.all()) {
    await expect(row.locator(".domain-row-actions button")).toHaveCount(5);
  }

  const firstRow = rows.first();
  const details = firstRow.getByRole("button", { name: /details for https:\/\/vault\.demo\.example/ });
  const check = firstRow.getByRole("button", { name: "Check https://vault.demo.example" });
  const duplicate = firstRow.getByRole("button", { name: "Duplicate https://vault.demo.example" });
  const edit = firstRow.getByRole("button", { name: "Edit https://vault.demo.example" });
  const remove = firstRow.getByRole("button", { name: "Remove https://vault.demo.example" });

  await expect(firstRow.locator(".domain-row-actions")).toHaveCSS("gap", "4px");
  await expect(details).toHaveCSS("height", "32px");
  for (const button of [check, duplicate, edit, remove]) {
    await expect(button).toHaveCSS("width", "32px");
    await expect(button).toHaveCSS("height", "32px");
  }

  await details.click();
  await expect(details).toHaveAttribute("aria-expanded", "true");
  await expect(firstRow.getByText("Current status")).toBeVisible();
  await details.click();
  await expect(details).toHaveAttribute("aria-expanded", "false");

  await check.click();
  await duplicate.click();
  const duplicateDialog = page.getByRole("dialog", { name: "Duplicate domain / service" });
  await expect(duplicateDialog).toBeVisible();
  await duplicateDialog.getByRole("button", { name: "Close dialog" }).click();

  await edit.click();
  const editDialog = page.getByRole("dialog", { name: "Edit domain / service" });
  await expect(editDialog).toBeVisible();
  const saveEdits = editDialog.getByRole("button", { name: "Save edits" });
  await expect(saveEdits).toHaveClass(/modal-submit/);
  await expect(saveEdits).toHaveCSS("height", "32px");
  await expect(saveEdits).toHaveCSS("padding", "4px 10px");
  await expect(saveEdits).toHaveCSS("font-size", "13px");
  await expect(saveEdits).toHaveCSS("font-weight", "700");
  await expect(saveEdits).toHaveCSS("border-radius", "6px");
  await expect(saveEdits).toHaveCSS("display", "flex");
  await expect(saveEdits).toHaveCSS("justify-content", "center");
  await expect(saveEdits).toHaveCSS("white-space", "nowrap");
  await expect(saveEdits).not.toBeDisabled();
  await expect(saveEdits).toHaveAttribute("aria-busy", "false");
  await editDialog.getByRole("button", { name: "Close dialog" }).click();

  await remove.click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete domain monitor" });
  await expect(deleteDialog).toBeVisible();
  const confirmationActions = deleteDialog.locator(".confirmation-actions");
  const cancel = deleteDialog.getByRole("button", { name: "Cancel" });
  const confirm = deleteDialog.getByRole("button", { name: "Delete monitor" });
  await expect(confirmationActions).toHaveCSS("gap", "6px");
  await expect(confirmationActions).toHaveCSS("justify-content", "flex-end");
  for (const button of [cancel, confirm]) {
    await expect(button).toHaveCSS("height", "32px");
    await expect(button).toHaveCSS("font-size", "13px");
    await expect(button).toHaveCSS("font-weight", "700");
    await expect(button).toHaveCSS("border-radius", "6px");
    await expect(button).toHaveCSS("display", "flex");
    await expect(button).toHaveCSS("align-items", "center");
    await expect(button).toHaveCSS("justify-content", "center");
  }
  await expect(cancel).toHaveClass(/secondary-button/);
  await expect(confirm).toHaveClass(/confirmation-action--danger/);
  await expect(confirm.locator("svg")).toHaveCSS("width", "14px");
  await expect(confirm.locator("svg")).toHaveCSS("height", "14px");
  await expect(cancel).not.toBeDisabled();
  await expect(confirm).not.toBeDisabled();
  await deleteDialog.getByRole("button", { name: "Close dialog" }).focus();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(deleteDialog.getByRole("button", { name: "Close dialog" })).toBeFocused();
  await cancel.click();
  await expect(deleteDialog).toBeHidden();
  await expect(remove).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await expect(details).toHaveCSS("height", "36px");
  for (const button of [check, duplicate, edit, remove]) {
    await expect(button).toHaveCSS("width", "36px");
    await expect(button).toHaveCSS("height", "36px");
  }

  await remove.click();
  await expect(deleteDialog).toBeVisible();
  for (const button of [cancel, confirm]) {
    await expect(button).toHaveCSS("height", "38px");
    await expect(button).toHaveCSS("white-space", "nowrap");
  }
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press("Escape");
  await expect(deleteDialog).toBeHidden();
});

test("live domain monitor create, update, and delete mutations persist through the API", async ({ page }, testInfo) => {
  const runMarker = `e2e-${Date.now()}-${testInfo.workerIndex}-${testInfo.retry}`;
  const initialPath = `/health?source=${runMarker}`;
  const updatedPath = `/health?source=${runMarker}-updated`;

  await page.addInitScript(() => {
    localStorage.setItem("nodeguard.preferences", JSON.stringify({
      hideSensitiveValues: true,
      refreshIntervalSeconds: 60,
    }));
  });
  await signIn(page, "e2e-owner", "e2e-owner-password");

  try {
    await page.getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Domains", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Domains / services" })).toBeVisible();

    await page.getByRole("button", { name: "Add domain", exact: true }).click();
    const createDialog = page.getByRole("dialog", { name: "Add domain / service" });
    await createDialog.getByLabel("Domain URL").fill("http://127.0.0.1:3210");
    await createDialog.getByLabel("Path").fill(initialPath);
    await createDialog.getByLabel("Expected HTTP codes").fill("200");
    const createResponse = page.waitForResponse((response) => (
      response.url().endsWith("/api/domains")
      && response.request().method() === "POST"
    ));
    await createDialog.getByRole("button", { name: "Add domain", exact: true }).click();
    expect((await createResponse).status()).toBe(201);
    const createdMonitor = page.locator(".domain-entry").filter({ hasText: initialPath });
    await expect(createdMonitor).toBeVisible();

    await createdMonitor.getByRole("button", { name: "Edit http://127.0.0.1:3210" }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit domain / service" });
    await editDialog.getByLabel("Path").fill(updatedPath);
    const updateResponse = page.waitForResponse((response) => (
      response.url().includes("/api/domains/")
      && response.request().method() === "PUT"
    ));
    await editDialog.getByRole("button", { name: "Save edits" }).click();
    expect((await updateResponse).status()).toBe(200);
    const updatedMonitor = page.locator(".domain-entry").filter({ hasText: updatedPath });
    await expect(updatedMonitor).toBeVisible();

    await updatedMonitor.getByRole("button", { name: "Remove http://127.0.0.1:3210" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "Delete domain monitor" });
    await expect(deleteDialog).toBeVisible();
    const deleteResponse = page.waitForResponse((response) => (
      response.url().includes("/api/domains/")
      && response.request().method() === "DELETE"
    ));
    await deleteDialog.getByRole("button", { name: "Delete monitor" }).click();
    expect((await deleteResponse).status()).toBe(200);
    await expect(page.getByText(`http://127.0.0.1:3210${updatedPath} was successfully deleted.`)).toBeVisible();
  } finally {
    const domainsResponse = await page.request.get(`${e2eApiUrl}/api/domains`);
    expect(domainsResponse.ok(), "cleanup can list domain monitors").toBe(true);
    const domains = await domainsResponse.json() as Array<{ id: string; path: string }>;
    const cleanupResponses = await Promise.all(domains
      .filter((domain) => domain.path.includes(runMarker))
      .map((domain) => page.request.delete(`${e2eApiUrl}/api/domains/${encodeURIComponent(domain.id)}`)));
    for (const response of cleanupResponses) {
      expect(response.ok(), "cleanup deletes the attempt-specific domain monitor").toBe(true);
    }
  }
});

test("mobile navigation uses responsive cards without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "demo", "demo");
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Open navigation" }).click();
  const navigationDialog = page.getByRole("dialog", { name: "NodeGuard navigation" });
  await expect(navigationDialog).toBeVisible();
  await navigationDialog.getByRole("button", { name: "Containers", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Containers", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Docker containers" })).toBeVisible();
  await expect(page.locator(".container-table-scroll")).toBeHidden();
  await expect(page.locator(".container-mobile-list .container-mobile-card").first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("dialog", { name: "NodeGuard navigation" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("shared empty states keep compact accessible typography on desktop and mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "demo", "demo");

  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Alerts", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Search alerts" }).fill("zzzz-no-match");

  const alertState = page.getByRole("status").filter({ hasText: "No alerts" });
  const alertTitle = alertState.locator(".state-block__title");
  const alertDescription = alertState.locator(".state-block__description");
  const alertIcon = alertState.locator(".state-block__icon");
  await expect(alertState).toBeVisible();
  await expect(alertTitle).toHaveCSS("font-size", "14px");
  await expect(alertTitle).toHaveCSS("font-weight", "600");
  await expect(alertDescription).toHaveCSS("font-size", "13px");
  await expect(alertDescription).toHaveCSS("font-weight", "400");
  await expect(alertIcon).toHaveCSS("width", "16px");
  await expect(page.getByRole("heading", { name: "Active alerts", level: 2 })).toHaveCSS("font-size", "14px");
  await expectNoHorizontalOverflow(page);

  await page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Proxmox", exact: true })
    .click();
  await page.getByRole("button", { name: "Virtual machines", exact: true }).click();
  await page.getByRole("button", { name: "Stopped", exact: true }).click();
  const proxmoxState = page.getByRole("status").filter({ hasText: "No matching guests" });
  await expect(proxmoxState).toBeVisible();
  await expect(proxmoxState.locator(".state-block__title")).toHaveCSS("font-size", "14px");
  await expect(proxmoxState.locator(".state-block__title")).toHaveCSS("font-weight", "600");
  await expect(proxmoxState.locator(".state-block__description")).toHaveCSS("font-size", "13px");
  await expect(proxmoxState.locator(".state-block__icon")).toHaveCSS("width", "16px");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(proxmoxState).toBeVisible();
  await expect(proxmoxState).toHaveCSS("min-height", "54px");
  await expect(proxmoxState.locator(".state-block__title")).toHaveCSS("font-size", "14px");
  await expect(proxmoxState.locator(".state-block__description")).toHaveCSS("font-size", "13px");
  await expectNoHorizontalOverflow(page);
});

test("login API failures are rendered safely without uncaught browser errors", async ({ page, browserDiagnostics }) => {
  browserDiagnostics.allowConsoleError(/Failed to load resource:.*status of 503/);
  browserDiagnostics.allowResponseFailure({
    method: "POST",
    path: "/api/auth/login",
    status: 503,
  });
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "temporarily_unavailable", message: "The test backend is temporarily unavailable." }),
    });
  });

  await page.goto("/");
  await page.getByPlaceholder("Username").fill("demo");
  await page.getByPlaceholder("Enter password").fill("demo");
  await page.getByRole("button", { name: "Sign in to NodeGuard" }).click();

  const error = page.getByRole("alert");
  await expect(error).toContainText("Sign in failed");
  await expect(error).toContainText("The test backend is temporarily unavailable.");
  await expect(page.getByRole("heading", { name: "Welcome to NodeGuard" })).toBeVisible();
});
