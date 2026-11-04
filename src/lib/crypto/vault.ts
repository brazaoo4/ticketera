import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const configuredSecret =
    process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();

  if (!configuredSecret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "CRITICAL: AUTH_SECRET or NEXTAUTH_SECRET must be set in production to encrypt store credentials."
      );
    }
    return crypto
      .createHash("sha256")
      .update("ticketera-dev-fallback-vault-secret-key-32b")
      .digest();
  }

  return crypto.createHash("sha256").update(configuredSecret).digest();
}

/**
 * Encrypts an arbitrary JSON-serializable object into an authenticated AES-256-GCM string.
 */
export function encryptVaultJson<T>(payload: T): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const jsonStr = JSON.stringify(payload);
  const ciphertext = Buffer.concat([
    cipher.update(jsonStr, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Combined buffer: [IV (12) | TAG (16) | CIPHERTEXT]
  const combined = Buffer.concat([iv, tag, ciphertext]);
  return combined.toString("base64");
}

/**
 * Decrypts a base64 string produced by encryptVaultJson back into the original object.
 */
export function decryptVaultJson<T>(encoded: string): T {
  const key = getEncryptionKey();
  const combined = Buffer.from(encoded, "base64");

  if (combined.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Invalid vault payload: insufficient length");
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8")) as T;
}

export const encryptCredentials = encryptVaultJson;
export const decryptCredentials = decryptVaultJson;

