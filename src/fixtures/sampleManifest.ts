import { z } from "zod";

export const sampleManifestSchema = z.object({
  schemaVersion: z.literal(1),
  sampleId: z.string().regex(/^[A-Z]+-[0-9]{3}-[a-z0-9-]+$/),
  purpose: z.string().min(1),
  capturedAt: z.string().datetime(),
  gameVersion: z.string().min(1),
  executableFingerprint: z.string().min(1),
  companionVersion: z.string().min(1),
  captureSchemaVersion: z.number().int().positive(),
  characterId: z.string().min(1),
  screen: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    windowsScalingPercent: z.number().positive(),
    windowMode: z.enum(["windowed", "borderless", "fullscreen"])
  }),
  storageId: z.string().min(1).optional(),
  calibrationProfileId: z.string().min(1).optional(),
  captureSource: z.string().min(1),
  preconditions: z.array(z.string()),
  actions: z.array(z.string()),
  expectedResult: z.string().min(1),
  observedResult: z.string().min(1),
  artifacts: z.array(z.string().min(1)),
  knownOmissions: z.array(z.string()),
  sanitized: z.boolean(),
  notes: z.string().optional()
});

export type SampleManifest = z.infer<typeof sampleManifestSchema>;
