// The standalone browser preview intentionally has no live DarkerDB runtime.
// The localhost Marketplace operator overrides this route without exposing its API key.
globalThis.__DARKERDB_MARKETPLACE_RUNTIME__ = undefined;
