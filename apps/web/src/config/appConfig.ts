function getHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    const url = new URL(value.trim());

    if (url.protocol !== "https:" || url.username || url.password) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export const appConfig = Object.freeze({
  supportUrl: getHttpsUrl(import.meta.env.VITE_NODEGUARD_SUPPORT_URL)
});
