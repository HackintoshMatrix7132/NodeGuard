import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface EncryptedIntegrationValue {
  encrypted: string;
  iv: string;
  tag: string;
}

function getEncryptionKey(): Buffer {
  const source =
    process.env.NODEGUARD_INTEGRATION_ENCRYPTION_KEY ??
    process.env.NODEGUARD_SESSION_SECRET ??
    process.env.NODEGUARD_AUTH_SECRET;

  if (!source || source.length < 24) {
    throw new Error(
      "A strong NODEGUARD_INTEGRATION_ENCRYPTION_KEY is required for integration credentials."
    );
  }

  return createHash("sha256").update(source, "utf8").digest();
}

export function encryptIntegrationValue(value: string): EncryptedIntegrationValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);

  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
}

export function decryptIntegrationValue(value: EncryptedIntegrationValue): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(value.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(value.encrypted, "base64")),
    decipher.final()
  ]).toString("utf8");
}
