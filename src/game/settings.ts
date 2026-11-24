export type Speed = 'relaxed' | 'normal' | 'fast';

export interface Settings {
  name: string;
  sound: boolean;
  speed: Speed;
  /** Move to the next round without waiting for a click. */
  autoAdvance: boolean;
  /** Show the optimiser's win chance under each set while arranging. */
  hints: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  name: 'You',
  sound: true,
  speed: 'normal',
  autoAdvance: false,
  hints: true,
};

export const SPEED_FACTOR: Record<Speed, number> = { relaxed: 1.35, normal: 1, fast: 0.6 };

const KEY = 'chapka.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    if (!(merged.speed in SPEED_FACTOR)) merged.speed = DEFAULT_SETTINGS.speed;
    merged.name = String(merged.name).trim().slice(0, 14) || DEFAULT_SETTINGS.name;
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private browsing); the settings then last for this visit only.
  }
}
