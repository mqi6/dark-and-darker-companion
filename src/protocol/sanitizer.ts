const SENSITIVE_KEYS = /(?:account|characterName|displayName|ipAddress|chat|friend|steam|uniqueId|raw|hexPreview)/i;
export interface SanitizedEvent { schemaVersion: string; command: number; messageType: string; direction: string; relativeTimestampMs: number; data: unknown }

export function sanitizeEvent(event: SanitizedEvent, aliases = new Map<string, string>()): SanitizedEvent {
  const clean = (value: unknown, key = ""): unknown => {
    if (SENSITIVE_KEYS.test(key)) {
      if (/uniqueId/i.test(key) && (typeof value === "string" || typeof value === "number" || typeof value === "bigint")) {
        const original = String(value); if (!aliases.has(original)) aliases.set(original, `item-${String(aliases.size + 1).padStart(3, "0")}`); return aliases.get(original);
      }
      return undefined;
    }
    if (Array.isArray(value)) return value.map(item => clean(item)).filter(item => item !== undefined);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, clean(item, name)]).filter(([, item]) => item !== undefined));
    return typeof value === "bigint" ? value.toString() : value;
  };
  return { ...event, data: clean(event.data) };
}

export function exportSanitizedEvents(events: SanitizedEvent[]): string {
  const aliases = new Map<string, string>();
  return `${JSON.stringify(events.map(event => sanitizeEvent(event, aliases)), null, 2)}\n`;
}
