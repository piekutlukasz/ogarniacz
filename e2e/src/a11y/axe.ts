import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/** Reguły WCAG 2.2 na poziomach A i AA; reguły „best practice” axe nie są wymaganiem, więc ich nie sprawdzamy. */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

/**
 * Problemy z dostępnością na tym, co jest teraz na ekranie, jako czytelne linie do porównania z pustą listą:
 * reguła, element i wyjaśnienie axe (np. kolory i wyliczony kontrast). Pusta lista znaczy, że ekran przeszedł.
 */
export async function accessibilityProblems(page: Page, where: string): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return violations.flatMap((violation) =>
    violation.nodes.map((node) => {
      const reason = [...node.any, ...node.all, ...node.none].map((check) => check.message).join('; ');
      return `${where}: ${violation.id} ${node.target.join(' ')} (${reason}) ${node.html.slice(0, 120)}`;
    }),
  );
}
