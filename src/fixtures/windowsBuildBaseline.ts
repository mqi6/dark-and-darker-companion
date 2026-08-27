import { z } from "zod";

export const windowsBuildBaselineSchema = z.object({
  schemaVersion: z.literal(1),
  sampleId: z.literal("BUILD-001"),
  capturedAt: z.iso.datetime(),
  gameBuildLabel: z.string().min(1),
  gameExecutableName: z.string().regex(/\.exe$/i),
  gameExecutableSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  gameExecutableSize: z.number().int().positive(),
  fileVersion: z.string().nullable(),
  productVersion: z.string().nullable(),
  windowsVersion: z.string().min(1),
  screen: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    windowsScalingPercent: z.number().int().positive(),
    windowMode: z.enum(["windowed", "borderless", "fullscreen"])
  }),
  gameLanguage: z.enum(["en", "zh-Hans"]),
  sanitized: z.literal(true)
});

export type WindowsBuildBaseline = z.infer<typeof windowsBuildBaselineSchema>;
