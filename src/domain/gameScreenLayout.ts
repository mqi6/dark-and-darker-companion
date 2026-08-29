import type { ScreenPoint, ScreenRectangle } from "./stashScreenCalibration";

export interface ScreenSize {
  width: number;
  height: number;
}

export type ScreenScaleMode = "independent-axes" | "centered-16:9-viewport";

export interface GameScreenTransform {
  mode: ScreenScaleMode;
  scaleX: number;
  scaleY: number;
  offsetX: number;
}

export interface GameScreenLayout {
  referenceResolution: ScreenSize;
  clientBounds: ScreenRectangle;
  transform: GameScreenTransform;
  controls: {
    startGame: ScreenPoint;
    stash: ScreenPoint;
    merchant: ScreenPoint;
    returnToCharacterSelection: ScreenPoint;
    enterLobby: ScreenPoint;
    characterPageNext: ScreenPoint;
    characterSlots: readonly ScreenPoint[];
  };
  stash: {
    gridTopLeft: ScreenPoint;
    gridBottomRight: ScreenPoint;
    playerBagGridTopLeft: ScreenPoint;
    columns: 12;
    rows: 20;
    cellPitch: number;
    tabCenters: readonly ScreenPoint[];
    tabSpacing: number;
  };
}

export const REFERENCE_GAME_RESOLUTION: Readonly<ScreenSize> = {
  width: 1920,
  height: 1080
};

export const REFERENCE_GAME_COORDINATES = {
  controls: {
    startGame: { x: 240, y: 41 },
    stash: { x: 880, y: 41 },
    merchant: { x: 1040, y: 41 },
    returnToCharacterSelection: { x: 1856, y: 1016 },
    enterLobby: { x: 960, y: 1000 },
    characterPageNext: { x: 1758, y: 875 },
    characterSlotOrigin: { x: 1696, y: 177 },
    characterSlotSpacing: 120
  },
  stash: {
    gridTopLeft: { x: 1378, y: 199 },
    playerBagGridTopLeft: { x: 690, y: 626 },
    columns: 12 as const,
    rows: 20 as const,
    cellPitch: 40.5,
    tabOrigin: { x: 1328, y: 211 },
    tabSpacing: 45
  }
} as const;

const STANDARD_ASPECT_RATIO = 16 / 9;
const ULTRAWIDE_TOLERANCE = 0.01;
const MINIMUM_STASH_TABS = 2;
const MAXIMUM_STASH_TABS = 10;

const MANUAL_STASH_OVERRIDES = new Map<string, {
  gridTopLeft: ScreenPoint;
  playerBagGridTopLeft: ScreenPoint;
  cellPitch: number;
  tabOrigin: ScreenPoint;
  tabSpacing: number;
}>([
  ["1280x720", {
    gridTopLeft: { x: 918, y: 132 },
    playerBagGridTopLeft: { x: 457, y: 416 },
    cellPitch: 27,
    tabOrigin: { x: 881, y: 139 },
    tabSpacing: 31
  }]
]);

export function dndToolsScreenTransform(size: ScreenSize): GameScreenTransform {
  validateScreenSize(size);
  const aspectRatio = size.width / size.height;
  if (aspectRatio > STANDARD_ASPECT_RATIO + ULTRAWIDE_TOLERANCE) {
    const scale = size.height / REFERENCE_GAME_RESOLUTION.height;
    const viewportWidth = size.height * STANDARD_ASPECT_RATIO;
    return {
      mode: "centered-16:9-viewport",
      scaleX: scale,
      scaleY: scale,
      offsetX: (size.width - viewportWidth) / 2
    };
  }
  return {
    mode: "independent-axes",
    scaleX: size.width / REFERENCE_GAME_RESOLUTION.width,
    scaleY: size.height / REFERENCE_GAME_RESOLUTION.height,
    offsetX: 0
  };
}

export function buildGameScreenLayout(parameters: {
  clientBounds: ScreenRectangle;
  visibleStashTabs: number;
}): GameScreenLayout {
  validateClientBounds(parameters.clientBounds);
  validateVisibleStashTabs(parameters.visibleStashTabs);
  const size = {
    width: parameters.clientBounds.width,
    height: parameters.clientBounds.height
  };
  const transform = dndToolsScreenTransform(size);
  const toScreen = (point: ScreenPoint): ScreenPoint => ({
    x: parameters.clientBounds.left + Math.round(point.x * transform.scaleX + transform.offsetX),
    y: parameters.clientBounds.top + Math.round(point.y * transform.scaleY)
  });

  const manualOverride = MANUAL_STASH_OVERRIDES.get(`${size.width}x${size.height}`);
  const relativeGridTopLeft = manualOverride?.gridTopLeft ?? scaledRelativePoint(
    REFERENCE_GAME_COORDINATES.stash.gridTopLeft,
    transform
  );
  const relativeBagTopLeft = manualOverride?.playerBagGridTopLeft ?? scaledRelativePoint(
    REFERENCE_GAME_COORDINATES.stash.playerBagGridTopLeft,
    transform
  );
  const relativeTabOrigin = manualOverride?.tabOrigin ?? scaledRelativePoint(
    REFERENCE_GAME_COORDINATES.stash.tabOrigin,
    transform
  );
  const cellPitch = manualOverride?.cellPitch ?? Math.max(
    REFERENCE_GAME_COORDINATES.stash.cellPitch * transform.scaleY,
    1
  );
  const tabSpacing = manualOverride?.tabSpacing ?? Math.max(
    REFERENCE_GAME_COORDINATES.stash.tabSpacing * transform.scaleY,
    1
  );
  const gridTopLeft = addClientOrigin(relativeGridTopLeft, parameters.clientBounds);
  const playerBagGridTopLeft = addClientOrigin(relativeBagTopLeft, parameters.clientBounds);
  const tabOrigin = addClientOrigin(relativeTabOrigin, parameters.clientBounds);
  const tabCenters = Array.from({ length: parameters.visibleStashTabs }, (_, index) => ({
    x: tabOrigin.x,
    y: Math.round(tabOrigin.y + index * tabSpacing)
  }));
  const characterSlots = Array.from({ length: 6 }, (_, index) => toScreen({
    x: REFERENCE_GAME_COORDINATES.controls.characterSlotOrigin.x,
    y: REFERENCE_GAME_COORDINATES.controls.characterSlotOrigin.y +
      index * REFERENCE_GAME_COORDINATES.controls.characterSlotSpacing
  }));

  return {
    referenceResolution: { ...REFERENCE_GAME_RESOLUTION },
    clientBounds: { ...parameters.clientBounds },
    transform,
    controls: {
      startGame: toScreen(REFERENCE_GAME_COORDINATES.controls.startGame),
      stash: toScreen(REFERENCE_GAME_COORDINATES.controls.stash),
      merchant: toScreen(REFERENCE_GAME_COORDINATES.controls.merchant),
      returnToCharacterSelection: toScreen(
        REFERENCE_GAME_COORDINATES.controls.returnToCharacterSelection
      ),
      enterLobby: toScreen(REFERENCE_GAME_COORDINATES.controls.enterLobby),
      characterPageNext: toScreen(REFERENCE_GAME_COORDINATES.controls.characterPageNext),
      characterSlots
    },
    stash: {
      gridTopLeft,
      gridBottomRight: {
        x: gridTopLeft.x + REFERENCE_GAME_COORDINATES.stash.columns * cellPitch,
        y: gridTopLeft.y + REFERENCE_GAME_COORDINATES.stash.rows * cellPitch
      },
      playerBagGridTopLeft,
      columns: REFERENCE_GAME_COORDINATES.stash.columns,
      rows: REFERENCE_GAME_COORDINATES.stash.rows,
      cellPitch,
      tabCenters,
      tabSpacing
    }
  };
}

function scaledRelativePoint(point: ScreenPoint, transform: GameScreenTransform): ScreenPoint {
  return {
    x: Math.round(point.x * transform.scaleX + transform.offsetX),
    y: Math.round(point.y * transform.scaleY)
  };
}

function addClientOrigin(point: ScreenPoint, bounds: ScreenRectangle): ScreenPoint {
  return { x: bounds.left + point.x, y: bounds.top + point.y };
}

function validateScreenSize(size: ScreenSize): void {
  if (![size.width, size.height].every(Number.isFinite) || size.width <= 0 || size.height <= 0) {
    throw new RangeError("Screen size must be finite and positive.");
  }
}

function validateClientBounds(bounds: ScreenRectangle): void {
  if (![bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite) ||
      bounds.width <= 0 || bounds.height <= 0) {
    throw new RangeError("Game client bounds must be finite and positive.");
  }
}

function validateVisibleStashTabs(value: number): void {
  if (!Number.isInteger(value) || value < MINIMUM_STASH_TABS || value > MAXIMUM_STASH_TABS) {
    throw new RangeError("Visible stash tab count must be an integer from 2 through 10.");
  }
}
