import { z } from 'zod';

export const USER_ROLES = ['parent', 'child'] as const;

export const userRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  login: z.string(),
  role: userRoleSchema,
});
export type User = z.infer<typeof userSchema>;

/** Login: małe litery, cyfry, kropka, myślnik i podkreślnik, żeby łatwo go wpisać na telefonie. */
export const loginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{2,32}$/, 'Login: 2–32 znaki, litery bez polskich znaków, cyfry, kropka, myślnik');

/**
 * Rodzaje wpisów w dzienniku logowań (`auth_events`). Część powstaje dopiero z kontami w aplikacji
 * (docs/plany/KONTA.md); lista jest pełna od razu, żeby kolejne kroki nie zmieniały znaczenia starych wpisów.
 */
export const AUTH_EVENT_TYPES = [
  'login_ok',
  'login_failed',
  'locked',
  'logout',
  'logout_all',
  'account_created',
  'password_changed',
  'password_reset',
  'account_disabled',
  'account_enabled',
  'invite_created',
  'invite_accepted',
  'invite_revoked',
  'setup_done',
] as const;
export const authEventTypeSchema = z.enum(AUTH_EVENT_TYPES);
export type AuthEventType = z.infer<typeof authEventTypeSchema>;

export const loginRequestSchema = z.object({
  login: z.string().trim().toLowerCase().min(1).max(32),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const userResponseSchema = z.object({ user: userSchema });

/** Tryb demo: lista kont do wejścia jednym przyciskiem. Zwykły serwer odpowiada na to 404. */
export const demoInfoSchema = z.object({
  demo: z.literal(true),
  accounts: z.array(z.object({ login: z.string(), name: z.string(), role: userRoleSchema })),
});
export type DemoInfo = z.infer<typeof demoInfoSchema>;

export const demoLoginRequestSchema = z.object({ login: z.string().trim().toLowerCase().min(1).max(32) });
export type DemoLoginRequest = z.infer<typeof demoLoginRequestSchema>;

/**
 * Kolor osoby na tablicy. API przyjmuje tylko nazwę z tej listy, a front zamienia ją na odcień,
 * który jest czytelny w obu motywach. Kolejność to też przydział domyślny dla osób bez wyboru.
 */
export const PERSON_COLORS = ['coral', 'blue', 'yellow', 'mint', 'lilac', 'pink', 'sky', 'lime'] as const;
export const personColorSchema = z.enum(PERSON_COLORS);
export type PersonColor = z.infer<typeof personColorSchema>;

/** Członek rodziny do wyboru osoby przy zadaniu. Bez loginu, bo nie jest tu potrzebny. */
export const familyMemberSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: userRoleSchema,
  /** Kolor wybrany w ustawieniach. Pusty: przydział według kolejności kont. */
  color: personColorSchema.nullable(),
});
export type FamilyMember = z.infer<typeof familyMemberSchema>;

/** Zmiana własnych ustawień. Kolory mogą się powtarzać między osobami. */
export const updateMeSchema = z.object({ color: personColorSchema.nullable() });
export type UpdateMe = z.infer<typeof updateMeSchema>;

export const familySchema = z.array(familyMemberSchema);

/** Hasło: najmniej 8 znaków (ochronę przed zgadywaniem daje limit prób), najwyżej tyle, ile przyjmuje logowanie. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;
/** Krótsze fragmenty loginu i imienia (np. „Jo”) nie blokują hasła, bo trafiałyby w zwykłe słowa. „Ola” już blokuje. */
const MIN_FORBIDDEN_PART = 3;

/**
 * Powód odrzucenia nowego hasła albo `null`, gdy hasło jest dobre. Ta sama reguła działa w formularzu,
 * w API i w CLI. Hasło nie może zawierać loginu ani imienia (żadnego z jego słów), bez względu na wielkość liter.
 */
export function passwordProblem(password: string, owner: { login: string; name: string }): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Hasło może mieć najwyżej ${MAX_PASSWORD_LENGTH} znaków`;
  const lower = password.toLocaleLowerCase('pl');
  const parts = [owner.login, ...owner.name.split(/\s+/)]
    .map((part) => part.trim().toLocaleLowerCase('pl'))
    .filter((part) => part.length >= MIN_FORBIDDEN_PART);
  if (parts.some((part) => lower.includes(part))) return 'Hasło nie może zawierać loginu ani imienia';
  return null;
}

/** Zmiana własnego hasła: obecne hasło potwierdza, że zmienia je właściciel, a nie ktoś z jego odblokowanym telefonem. */
export const changePasswordSchema = z.object({
  current: z.string().min(1, 'Podaj obecne hasło').max(MAX_PASSWORD_LENGTH),
  next: z.string().min(1, 'Podaj nowe hasło').max(MAX_PASSWORD_LENGTH, `Hasło może mieć najwyżej ${MAX_PASSWORD_LENGTH} znaków`),
});
export type ChangePassword = z.infer<typeof changePasswordSchema>;

/** Wynik „Wyloguj inne urządzenia”: ile sesji zakończono. Bieżąca zostaje. */
export const logoutOthersResponseSchema = z.object({ count: z.number().int().nonnegative() });
export type LogoutOthersResponse = z.infer<typeof logoutOthersResponseSchema>;
