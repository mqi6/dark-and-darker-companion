import { describe, expect, it, vi } from "vitest";
import { DarkerDbClient, DarkerDbHttpError } from "../src/adapters/darkerdb";

describe("DarkerDbClient", () => {
  it("requests localized item data and returns pagination metadata", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          body: [{ id: "id.item.longbow", name: "长弓" }],
          pagination: { next: "cursor-2", total: 2400 }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = new DarkerDbClient({
      apiKey: "secret-test-key",
      baseUrl: "https://example.test",
      fetchImplementation
    });

    const page = await client.getItems<{ id: string; name: string }[]>({
      locale: "zh-CN",
      limit: 200
    });

    const calledUrl = fetchImplementation.mock.calls[0]?.[0];
    expect(String(calledUrl)).toContain("locale=zh-CN");
    expect(String(calledUrl)).toContain("limit=200");
    expect(page).toMatchObject({ nextCursor: "cursor-2", reportedTotal: 2400 });
  });

  it("keeps authentication errors distinct from empty results", async () => {
    const client = new DarkerDbClient({
      baseUrl: "https://example.test",
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
        new Response("unauthorized", { status: 401, statusText: "Unauthorized" })
      )
    });
    await expect(client.getAttributes({ locale: "en" })).rejects.toBeInstanceOf(
      DarkerDbHttpError
    );
  });
});
