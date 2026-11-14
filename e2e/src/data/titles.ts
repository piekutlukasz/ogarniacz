import { test } from '@playwright/test';

/**
 * Baza e2e nie jest czyszczona między uruchomieniami, a projekty i testy biegną równolegle,
 * więc każdy test pracuje na zadaniach z własną, niepowtarzalną nazwą.
 */
export function uniqueTitle(base: string): string {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${base} ${test.info().project.name} ${suffix}`;
}
