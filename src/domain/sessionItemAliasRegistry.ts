export type ItemAliasResolver = (rawUniqueId: string) => string;

/**
 * Keeps opaque item aliases stable for one capture/runtime session.
 * Raw game item identifiers never leave this in-memory registry.
 */
export class SessionItemAliasRegistry {
  private readonly aliases = new Map<string, string>();
  private nextAlias = 1;

  get size(): number {
    return this.aliases.size;
  }

  aliasFor(rawUniqueId: string): string {
    const existing = this.aliases.get(rawUniqueId);
    if (existing) return existing;
    const alias = `item-${String(this.nextAlias).padStart(3, "0")}`;
    this.nextAlias += 1;
    this.aliases.set(rawUniqueId, alias);
    return alias;
  }
}
