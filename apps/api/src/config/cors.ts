export function isRequestOriginAllowed(origin: string | undefined, protocol: string, host: string | undefined, allowedOrigins: string[]) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (!host) return false;

  try {
    return new URL(origin).origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}
