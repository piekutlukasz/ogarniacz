import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, authEventTypeSchema, loginSchema, userRoleSchema } from './auth';

/**
 * Konta w aplikacji (docs/plany/KONTA.md, krok 2): zaproszenia, lista kont rodziny i dziennik logowań.
 * Tokenu zaproszenia nie ma w żadnej odpowiedzi poza tą, która go tworzy.
 */

/** Zaproszenie ważne jest dobę od utworzenia. */
export const INVITE_TTL_HOURS = 24;
/** Najwięcej oczekujących zaproszeń naraz. */
export const MAX_PENDING_INVITES = 5;
/** Najwięcej aktywnych kont (bez wyłączonych), licząc oczekujące zaproszenia na nowe konta. */
export const MAX_ACTIVE_ACCOUNTS = 10;

/** Ten sam komunikat dla złego, użytego, wygasłego i unieważnionego tokenu: odpowiedź nie zdradza jego stanu. */
export const INVALID_INVITE_MESSAGE = 'To zaproszenie jest nieważne. Poproś rodzica o nowe';

export const INVITE_KINDS = ['new_account', 'password_reset'] as const;
export const inviteKindSchema = z.enum(INVITE_KINDS);
export type InviteKind = z.infer<typeof inviteKindSchema>;

/** Hasło rodzica, który wykonuje operację. Przejęta sesja (np. odblokowany telefon) nie wystarcza. */
const confirmSchema = z.string({ error: 'Potwierdź swoim hasłem' }).min(1, 'Potwierdź swoim hasłem').max(MAX_PASSWORD_LENGTH);

export const personNameSchema = z.string().trim().min(1, 'Podaj imię').max(40, 'Imię może mieć najwyżej 40 znaków');

export const createInviteSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('new_account'), login: loginSchema, name: personNameSchema, role: userRoleSchema, confirm: confirmSchema }),
  z.object({ kind: z.literal('password_reset'), userId: z.uuid('Wybierz osobę'), confirm: confirmSchema }),
]);
export type CreateInvite = z.infer<typeof createInviteSchema>;

/** Oczekujące zaproszenie na liście rodzica. */
export const inviteSchema = z.object({
  id: z.uuid(),
  kind: inviteKindSchema,
  login: z.string(),
  name: z.string(),
  /** Rola nowego konta; pusta przy nowym haśle. */
  role: userRoleSchema.nullable(),
  /** Konto, którego dotyczy nowe hasło; puste przy nowym koncie. */
  userId: z.uuid().nullable(),
  createdBy: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type Invite = z.infer<typeof inviteSchema>;
export const invitesSchema = z.array(inviteSchema);

/** Odpowiedź na utworzenie zaproszenia: jedyne miejsce, w którym widać token. Link to `/#zaproszenie=<token>`. */
export const createdInviteSchema = z.object({ invite: inviteSchema, token: z.string() });
export type CreatedInvite = z.infer<typeof createdInviteSchema>;

/** Token jest w treści żądania, nie w adresie, żeby nie trafiał do logów serwera i proxy. */
const inviteTokenSchema = z.string().min(1, INVALID_INVITE_MESSAGE).max(200, INVALID_INVITE_MESSAGE);

export const invitePreviewRequestSchema = z.object({ token: inviteTokenSchema });
export const invitePreviewSchema = z.object({ kind: inviteKindSchema, name: z.string(), login: z.string() });
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

export const acceptInviteSchema = z.object({
  token: inviteTokenSchema,
  password: z.string().min(1, 'Podaj hasło').max(MAX_PASSWORD_LENGTH, `Hasło może mieć najwyżej ${MAX_PASSWORD_LENGTH} znaków`),
});
export type AcceptInvite = z.infer<typeof acceptInviteSchema>;

/** Konto na liście rodzica. Bez haseł i tokenów. */
export const accountSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  login: z.string(),
  role: userRoleSchema,
  disabled: z.boolean(),
  createdAt: z.iso.datetime(),
  /** Ostatnie udane logowanie z dziennika; puste, gdy było dawniej niż 90 dni temu. */
  lastLoginAt: z.iso.datetime().nullable(),
  /** Ostatnie użycie aplikacji (z dokładnością do godziny) na którymkolwiek urządzeniu. */
  lastSeenAt: z.iso.datetime().nullable(),
});
export type Account = z.infer<typeof accountSchema>;
export const accountsSchema = z.array(accountSchema);

/** Wyłączenie albo włączenie konta dziecka. */
export const updateAccountSchema = z.object({ disabled: z.boolean(), confirm: confirmSchema });
export type UpdateAccount = z.infer<typeof updateAccountSchema>;

/** Wpis dziennika logowań dla rodzica. */
export const authEventSchema = z.object({
  createdAt: z.iso.datetime(),
  type: authEventTypeSchema,
  /** Konto, którego dotyczy wpis; puste, gdy login nie istnieje albo przy blokadzie adresu. */
  login: z.string().nullable(),
  name: z.string().nullable(),
  /** Kto wykonał operację; puste przy logowaniu i operacjach z CLI. */
  actorName: z.string().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  detail: z.string().nullable(),
});
export type AuthEvent = z.infer<typeof authEventSchema>;
export const authEventsSchema = z.array(authEventSchema);
