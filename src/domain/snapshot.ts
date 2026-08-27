import { z } from "zod";

const canonicalIdSchema = z.string().regex(/^id\.[a-z0-9_.-]+$/i);

export const itemRollSchema = z.object({
  attributeId: canonicalIdSchema,
  value: z.number().finite()
});

export const capturedItemSchema = z.object({
  instanceKey: z.string().min(1),
  itemId: canonicalIdSchema,
  quantity: z.number().int().positive(),
  rarity: z.string().min(1).optional(),
  location: z.object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive()
  }),
  rolls: z.array(itemRollSchema)
});

export const storageSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    snapshotId: z.string().min(1),
    capturedAt: z.string().datetime(),
    gameBuildFingerprint: z.string().min(1),
    characterId: z.string().min(1),
    storageId: z.string().min(1),
    grid: z.object({
      columns: z.number().int().positive(),
      rows: z.number().int().positive()
    }),
    items: z.array(capturedItemSchema),
    warnings: z.array(z.string()).default([])
  })
  .superRefine((snapshot, context) => {
    const occupied = new Map<string, string>();
    for (const item of snapshot.items) {
      const { x, y, width, height } = item.location;
      if (x + width > snapshot.grid.columns || y + height > snapshot.grid.rows) {
        context.addIssue({
          code: "custom",
          path: ["items", item.instanceKey, "location"],
          message: `Item '${item.instanceKey}' extends outside the storage grid.`
        });
        continue;
      }

      for (let cellY = y; cellY < y + height; cellY += 1) {
        for (let cellX = x; cellX < x + width; cellX += 1) {
          const key = `${cellX},${cellY}`;
          const existing = occupied.get(key);
          if (existing) {
            context.addIssue({
              code: "custom",
              path: ["items", item.instanceKey, "location"],
              message: `Item '${item.instanceKey}' overlaps '${existing}' at ${key}.`
            });
          } else {
            occupied.set(key, item.instanceKey);
          }
        }
      }
    }
  });

export type StorageSnapshot = z.infer<typeof storageSnapshotSchema>;
