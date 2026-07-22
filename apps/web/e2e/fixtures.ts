import { expect, test as base, type Page } from "@playwright/test";

export const e2eApiUrl = "http://127.0.0.1:3210";

type ExpectedResponseFailure = {
  method: string;
  path: string;
  status: number;
};

type BrowserDiagnostics = {
  allowConsoleError: (pattern: RegExp) => void;
  allowResponseFailure: (failure: ExpectedResponseFailure) => void;
};

export const test = base.extend<{ browserDiagnostics: BrowserDiagnostics }>({
  browserDiagnostics: [async ({ page }, use) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const requestFailures: string[] = [];
    const responseFailures: string[] = [];
    const expectedConsoleErrors: RegExp[] = [];
    const expectedResponseFailures: ExpectedResponseFailure[] = [];

    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const expectedIndex = expectedConsoleErrors.findIndex((pattern) => pattern.test(message.text()));
      if (expectedIndex >= 0) {
        expectedConsoleErrors.splice(expectedIndex, 1);
        return;
      }
      consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      requestFailures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown failure"}`);
    });
    page.on("response", (response) => {
      if (response.status() < 400) return;
      const request = response.request();
      const url = new URL(response.url());
      const expectedIndex = expectedResponseFailures.findIndex((failure) => (
        failure.method === request.method()
        && failure.path === url.pathname
        && failure.status === response.status()
      ));
      if (expectedIndex >= 0) {
        expectedResponseFailures.splice(expectedIndex, 1);
        return;
      }
      responseFailures.push(`${request.method()} ${url.pathname}: HTTP ${response.status()}`);
    });

    await use({
      allowConsoleError: (pattern) => expectedConsoleErrors.push(pattern),
      allowResponseFailure: (failure) => expectedResponseFailures.push(failure),
    });

    expect.soft(consoleErrors, "browser console errors").toEqual([]);
    expect.soft(pageErrors, "uncaught browser errors").toEqual([]);
    expect.soft(requestFailures, "network request failures").toEqual([]);
    expect.soft(responseFailures, "unexpected HTTP error responses").toEqual([]);
    expect.soft(expectedConsoleErrors, "expected console errors that were never observed").toEqual([]);
    expect.soft(expectedResponseFailures, "expected HTTP errors that were never observed").toEqual([]);
  }, { auto: true }],
});

export { expect } from "@playwright/test";

export async function signIn(page: Page, username: string, password: string) {
  await page.goto("/");
  await page.getByPlaceholder("Username").fill(username);
  await page.getByPlaceholder("Enter password").fill(password);
  await page.getByRole("button", { name: "Sign in to NodeGuard" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Active issues", exact: true })).toBeVisible();
}

export async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}
