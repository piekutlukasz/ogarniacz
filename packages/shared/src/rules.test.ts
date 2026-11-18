import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isClosedWeek, payoutDay } from './allowance';
import { isQuietHour } from './notifications';
import { SETUP_CODE_ALPHABET, normalizeSetupCode } from './setup';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordProblem } from './auth';
import { TITLE_MAX_LENGTH, canChangeTask, canReleaseTask, canRenameTask, canTakeTask, isOverdue, titleProblem } from './tasks';
import { addDays, weekStart } from './time';

const PARENT = { id: 'rodzic', role: 'parent' as const };
const CHILD = { id: 'dziecko', role: 'child' as const };
const OTHER = 'inna-osoba';

describe('uprawnienia do zadań (PROJEKT.md, rozdział 6)', () => {
  it.each([
    ['rodzic, cudze zadanie', PARENT, OTHER, true],
    ['rodzic, zadanie bez osoby', PARENT, null, true],
    ['dziecko, swoje zadanie', CHILD, CHILD.id, true],
    ['dziecko, cudze zadanie', CHILD, OTHER, false],
    ['dziecko, zadanie bez osoby', CHILD, null, false],
  ] as const)('canChangeTask: %s', (_, user, assigneeId, expected) => {
    expect(canChangeTask(user, { assigneeId })).toBe(expected);
  });

  it.each([
    ['dziecko bierze zadanie bez osoby', CHILD, null, true],
    ['dziecko nie bierze cudzego', CHILD, OTHER, false],
    ['rodzic nie „bierze”, tylko zmienia', PARENT, null, false],
  ] as const)('canTakeTask: %s', (_, user, assigneeId, expected) => {
    expect(canTakeTask(user, { assigneeId })).toBe(expected);
  });

  it('tytuł zadania z nagrodą zmienia tylko rodzic', () => {
    const reward = 5;
    expect(canRenameTask(CHILD, { assigneeId: CHILD.id, reward })).toBe(false);
    expect(canRenameTask(CHILD, { assigneeId: CHILD.id, reward: null })).toBe(true);
    expect(canRenameTask(PARENT, { assigneeId: CHILD.id, reward })).toBe(true);
    expect(canRenameTask(CHILD, { assigneeId: OTHER, reward: null })).toBe(false);
  });

  it.each([
    ['rodzic oddaje swoje „Do zrobienia”', PARENT, PARENT.id, OTHER, 'todo', true],
    ['dziecko oddaje zadanie, które samo wzięło', CHILD, CHILD.id, CHILD.id, 'todo', true],
    ['dziecko nie oddaje przydzielonego przez rodzica', CHILD, CHILD.id, PARENT.id, 'todo', false],
    ['nie oddaje się zadania w trakcie', PARENT, PARENT.id, PARENT.id, 'in_progress', false],
    ['nie oddaje się cudzego', PARENT, OTHER, PARENT.id, 'todo', false],
  ] as const)('canReleaseTask: %s', (_, user, assigneeId, assignedById, status, expected) => {
    expect(canReleaseTask(user, { assigneeId, assignedById, status })).toBe(expected);
  });

  it('dziecko nigdy nie zmienia zadania, które nie jest jego', () => {
    fc.assert(
      fc.property(fc.option(fc.string()), (assigneeId) => {
        fc.pre(assigneeId !== CHILD.id);
        expect(canChangeTask(CHILD, { assigneeId })).toBe(false);
        expect(canRenameTask(CHILD, { assigneeId, reward: null })).toBe(false);
      }),
    );
  });
});

describe('isOverdue', () => {
  it('zaległe to niezakończone z terminem przed dziś', () => {
    expect(isOverdue({ dueOn: '2026-11-17', status: 'todo' }, '2026-11-18')).toBe(true);
    expect(isOverdue({ dueOn: '2026-11-17', status: 'done' }, '2026-11-18')).toBe(false);
    expect(isOverdue({ dueOn: '2026-11-18', status: 'in_progress' }, '2026-11-18')).toBe(false);
    expect(isOverdue({ dueOn: null, status: 'todo' }, '2026-11-18')).toBe(false);
  });
});

describe('passwordProblem', () => {
  const owner = { login: 'tata', name: 'Jan Kowalski' };

  it.each([
    ['krótkie', 'a1b2c3d', `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`],
    ['za długie', 'x'.repeat(MAX_PASSWORD_LENGTH + 1), `Hasło może mieć najwyżej ${MAX_PASSWORD_LENGTH} znaków`],
    ['z loginem', 'mojTATA2026', 'Hasło nie może zawierać loginu ani imienia'],
    ['z nazwiskiem', 'kowalski!!', 'Hasło nie może zawierać loginu ani imienia'],
    ['dobre', 'zielony-rower', null],
  ])('%s', (_, password, expected) => {
    expect(passwordProblem(password, owner)).toBe(expected);
  });

  it('słowa krótsze niż 3 znaki nie blokują hasła, trzyliterowe już tak', () => {
    expect(passwordProblem('joanna-12', { login: 'jo', name: 'Jo' })).toBeNull();
    expect(passwordProblem('kolano-12', { login: 'mama', name: 'Ola' })).not.toBeNull();
  });

  it('nie rozróżnia wielkości liter, także polskich', () => {
    expect(passwordProblem('xxŁUKASZxx', { login: 'tata', name: 'Łukasz' })).not.toBeNull();
  });

  it('hasło z loginem w środku jest zawsze odrzucane', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 3, maxLength: 12 }).filter((login) => login.trim() === login && !/\s/.test(login)), fc.string({ maxLength: 10 }), fc.string({ maxLength: 10 }), (login, before, after) => {
        const password = `${before}${login}${after}`;
        fc.pre(password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH);
        expect(passwordProblem(password, { login, name: 'X' })).not.toBeNull();
      }),
    );
  });
});

describe('kieszonkowe', () => {
  it('wypłata za tydzień jest w następny poniedziałek', () => {
    expect(payoutDay('2026-11-09')).toBe('2026-11-16');
  });

  it('tydzień jest zamknięty dopiero od poniedziałku po jego niedzieli', () => {
    expect(isClosedWeek('2026-11-09', '2026-11-15')).toBe(false);
    expect(isClosedWeek('2026-11-09', '2026-11-16')).toBe(true);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 6 }), fc.integer({ min: 7, max: 400 }), (inside, after) => {
        const start = weekStart('2026-11-16');
        expect(isClosedWeek(start, addDays(start, inside))).toBe(false);
        expect(isClosedWeek(start, addDays(start, after))).toBe(true);
      }),
    );
  });
});

describe('titleProblem', () => {
  it('liczy znaki po obcięciu spacji', () => {
    expect(titleProblem('   ')).toBe('Podaj nazwę zadania');
    expect(titleProblem('  ab  ')).toBe('Nazwa zadania musi mieć co najmniej 3 znaki');
    expect(titleProblem(' abc ')).toBeUndefined();
    expect(titleProblem('x'.repeat(TITLE_MAX_LENGTH))).toBeUndefined();
    expect(titleProblem('x'.repeat(TITLE_MAX_LENGTH + 1))).toBe(`Nazwa zadania może mieć najwyżej ${TITLE_MAX_LENGTH} znaków`);
  });
});

describe('isQuietHour', () => {
  it('cisza przez północ: 22–7', () => {
    const prefs = { quietFrom: 22, quietTo: 7 };
    expect([21, 22, 23, 0, 6, 7].map((hour) => isQuietHour(hour, prefs))).toEqual([false, true, true, true, true, false]);
  });

  it('cisza w ciągu dnia: 13–15', () => {
    const prefs = { quietFrom: 13, quietTo: 15 };
    expect([12, 13, 14, 15].map((hour) => isQuietHour(hour, prefs))).toEqual([false, true, true, false]);
  });

  it('w ciągu doby jest tyle godzin ciszy, ile wynosi odstęp od początku do końca', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 23 }), (quietFrom, quietTo) => {
        const quiet = Array.from({ length: 24 }, (_, hour) => isQuietHour(hour, { quietFrom, quietTo })).filter(Boolean);
        expect(quiet).toHaveLength((quietTo - quietFrom + 24) % 24);
      }),
    );
  });
});

describe('normalizeSetupCode', () => {
  it('przyjmuje kod przepisany z małych liter, ze spacjami i bez myślnika', () => {
    expect(normalizeSetupCode(' k7m2 - 9qxd ')).toBe('K7M2' + '9QXD');
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom(...SETUP_CODE_ALPHABET), minLength: 8, maxLength: 8 }), (code) => {
        const typed = `${code.slice(0, 4).toLowerCase()} -${code.slice(4)}`;
        expect(normalizeSetupCode(typed)).toBe(code);
      }),
    );
  });
});
