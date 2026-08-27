const sensitiveKeys = new Set([
  "account",
  "account_id",
  "character",
  "character_id",
  "character_name",
  "found_by",
  "request_id",
  "seller",
  "seller_id",
  "seller_name",
  "user",
  "user_id",
  "username"
]);

export function sanitizeDarkerDbSample(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeDarkerDbSample);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      sensitiveKeys.has(key.toLowerCase()) ? "[redacted]" : sanitizeDarkerDbSample(nested)
    ])
  );
}
