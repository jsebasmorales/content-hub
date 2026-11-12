import type { AstroCookies } from 'astro';

/** What a person can choose. "system" means: follow the device, which is the default. */
export const THEME_CHOICES = ['light', 'dark', 'system'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

export const THEME_COOKIE = 'hub_theme';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export function parseThemeChoice(value: string | null | undefined): ThemeChoice | null {
  return THEME_CHOICES.find((choice) => choice === value) ?? null;
}

/** The theme the person fixed, or `system` when they never chose one or the cookie is unusable. */
export function readTheme(cookies: AstroCookies): ThemeChoice {
  return parseThemeChoice(cookies.get(THEME_COOKIE)?.value) ?? 'system';
}

/**
 * Remembers the choice in this browser. It is a display preference, not a secret, but it is still
 * kept out of reach of scripts (`httpOnly`): nothing in the page needs to read it.
 */
export function writeTheme(cookies: AstroCookies, choice: ThemeChoice, secure: boolean): void {
  if (choice === 'system') {
    cookies.delete(THEME_COOKIE, { path: '/' });
    return;
  }
  cookies.set(THEME_COOKIE, choice, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
}
