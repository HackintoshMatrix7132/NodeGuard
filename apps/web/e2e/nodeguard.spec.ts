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

test("domain row actions stay compact, accessible, and non-destructive", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
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
  await editDialog.getByRole("button", { name: "Close dialog" }).click();

  await remove.click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete domain monitor" });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(deleteDialog).toBeHidden();

  await details.focus();
  await expect(details).toBeFocused();
  for (const button of [check, duplicate, edit, remove]) {
    await page.keyboard.press("Tab");
    await expect(button).toBeFocused();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await expect(details).toHaveCSS("height", "36px");
  for (const button of [check, duplicate, edit, remove]) {
    await expect(button).toHaveCSS("width", "36px");
    await expect(button).toHaveCSS("height", "36px");
  }
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
