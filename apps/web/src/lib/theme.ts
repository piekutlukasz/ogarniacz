import { useState } from 'react';

/** Motyw na tym urządzeniu. „system” idzie za ustawieniem telefonu. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** Ten sam klucz czyta public/theme.js przed pierwszym malowaniem. */
const STORAGE_KEY = 'ogarniacz.theme';

/** Wygląd (kierunek graficzny), niezależny od trybu jasny/ciemny. „fridge” to „Lodówka”, domyślna. */
export type Look = 'fridge' | 'forest' | 'stickers';

/** Ten klucz też czyta public/theme.js. */
const LOOK_KEY = 'ogarniacz.look';
const LOOKS: readonly Look[] = ['fridge', 'forest', 'stickers'];

/** Kolor paska stanu dla każdego wyglądu i trybu, taki jak tło aplikacji (--color-paper). */
const THEME_COLORS: Record<Look, { light: string; dark: string }> = {
  fridge: { light: '#fbf6ec', dark: '#1d1815' },
  forest: { light: '#f1f4ec', dark: '#101a15' },
  stickers: { light: '#ffe14d', dark: '#1a1920' },
};

export function readLook(): Look {
  try {
    const value = localStorage.getItem(LOOK_KEY);
    return LOOKS.find((look) => look === value) ?? 'fridge';
  } catch {
    return 'fridge';
  }
}

function saveLook(look: Look) {
  try {
    if (look === 'fridge') localStorage.removeItem(LOOK_KEY);
    else localStorage.setItem(LOOK_KEY, look);
  } catch {
    // Tryb prywatny Safari potrafi blokować zapis. Wygląd działa do zamknięcia aplikacji.
  }
}

export function readThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function saveThemePreference(preference: ThemePreference) {
  try {
    if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Tryb prywatny Safari potrafi blokować zapis. Motyw działa do zamknięcia aplikacji.
  }
}

/**
 * Ustawia motyw na <html> i kolor paska stanu. W index.html są dwa meta theme-color z media,
 * więc przy wymuszonym motywie oba dostają jego kolor, a przy systemowym wracają do swoich.
 */
export function applyThemePreference(preference: ThemePreference, look: Look = readLook()) {
  const root = document.documentElement;
  if (preference === 'system') delete root.dataset.theme;
  else root.dataset.theme = preference;
  if (look === 'fridge') delete root.dataset.look;
  else root.dataset.look = look;

  const colors = THEME_COLORS[look];
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = meta.media.includes('dark') ? colors.dark : colors.light;
    meta.content = preference === 'system' ? own : colors[preference];
  }
}

export function useLook(): [Look, (look: Look) => void] {
  const [look, setLook] = useState(readLook);

  const change = (next: Look) => {
    setLook(next);
    saveLook(next);
    applyThemePreference(readThemePreference(), next);
  };

  return [look, change];
}

export function useThemePreference(): [ThemePreference, (preference: ThemePreference) => void] {
  const [preference, setPreference] = useState(readThemePreference);

  const change = (next: ThemePreference) => {
    setPreference(next);
    saveThemePreference(next);
    applyThemePreference(next);
  };

  return [preference, change];
}
