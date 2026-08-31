export const AUTOMATION_SPEED_PRESETS = [
  "fast",
  "balanced",
  "reliable",
  "custom"
] as const;

export type AutomationSpeedPreset = typeof AUTOMATION_SPEED_PRESETS[number];

export interface SortInputTiming {
  pointerSettleMilliseconds: number;
  clickHoldMilliseconds: number;
  postClickMilliseconds: number;
  tabSettleMilliseconds: number;
  dragDurationMilliseconds: number;
  postDragMilliseconds: number;
}

export const SORT_INPUT_TIMING_LIMITS = Object.freeze({
  pointerSettleMilliseconds: { minimum: 0, maximum: 500 },
  clickHoldMilliseconds: { minimum: 10, maximum: 250 },
  postClickMilliseconds: { minimum: 20, maximum: 2000 },
  tabSettleMilliseconds: { minimum: 50, maximum: 3000 },
  dragDurationMilliseconds: { minimum: 100, maximum: 2000 },
  postDragMilliseconds: { minimum: 20, maximum: 2000 }
});

export const SORT_INPUT_TIMING_PRESETS: Readonly<
  Record<Exclude<AutomationSpeedPreset, "custom">, SortInputTiming>
> = Object.freeze({
  fast: Object.freeze({
    pointerSettleMilliseconds: 20,
    clickHoldMilliseconds: 15,
    postClickMilliseconds: 50,
    tabSettleMilliseconds: 100,
    dragDurationMilliseconds: 160,
    postDragMilliseconds: 60
  }),
  balanced: Object.freeze({
    pointerSettleMilliseconds: 50,
    clickHoldMilliseconds: 30,
    postClickMilliseconds: 150,
    tabSettleMilliseconds: 250,
    dragDurationMilliseconds: 350,
    postDragMilliseconds: 150
  }),
  reliable: Object.freeze({
    pointerSettleMilliseconds: 100,
    clickHoldMilliseconds: 60,
    postClickMilliseconds: 350,
    tabSettleMilliseconds: 700,
    dragDurationMilliseconds: 800,
    postDragMilliseconds: 400
  })
});

export function resolveSortInputTiming(parameters: {
  preset: AutomationSpeedPreset;
  custom?: Partial<SortInputTiming>;
}): SortInputTiming {
  const base = parameters.preset === "custom"
    ? SORT_INPUT_TIMING_PRESETS.balanced
    : SORT_INPUT_TIMING_PRESETS[parameters.preset];
  const value = {
    ...base,
    ...(parameters.custom ?? {})
  };
  validateSortInputTiming(value);
  return value;
}

export function validateSortInputTiming(value: SortInputTiming): void {
  for (const key of Object.keys(SORT_INPUT_TIMING_LIMITS) as Array<keyof SortInputTiming>) {
    const milliseconds = value[key];
    const limits = SORT_INPUT_TIMING_LIMITS[key];
    if (!Number.isInteger(milliseconds) ||
        milliseconds < limits.minimum ||
        milliseconds > limits.maximum) {
      throw new RangeError(
        `${key} must be an integer from ${limits.minimum} to ${limits.maximum} milliseconds.`
      );
    }
  }
}
