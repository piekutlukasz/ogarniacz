import type { AuthEventType, CalendarErrorCode, CalendarScope, InviteKind, NotificationLogKind, PersonColor, RecurrencePattern, TaskColor, TaskStatus, UserRole } from '@ogarniacz/shared';
import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    status: text('status').$type<TaskStatus>().notNull().default('todo'),
    assigneeId: text('assignee_id').references(() => users.id),
    // Kto ustawił obecną osobę. Dziecko może oddać tylko zadanie, które samo wzięło, a nie przydzielone przez rodzica.
    assignedById: text('assigned_by').references(() => users.id),
    // Dzień RRRR-MM-DD w strefie Europe/Warsaw. To data, a nie chwila, więc nie trzymamy jej w UTC.
    dueOn: text('due_on'),
    // Puste tylko przy zadaniach sprzed etapu 3.
    createdById: text('created_by').references(() => users.id),
    // Reguła cykliczna, z której powstało zadanie. Puste przy zadaniach dodanych ręcznie.
    recurrenceId: text('recurrence_id').references(() => recurrences.id),
    // Nagroda w pełnych złotych, doliczana do kieszonkowego dziecka. Ustawia ją tylko rodzic.
    reward: integer('reward'),
    // Kolor karteczki na tablicy. Puste: zwykła karteczka.
    color: text('color').$type<TaskColor>(),
    // Chwila wejścia w „Gotowe”, pusta poza tym statusem. Od niej zależy, do którego tygodnia trafia nagroda.
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    // Wypłata, w której nagroda została już policzona. Cofnięte i ponownie ukończone zadanie nie liczy się drugi raz.
    payoutId: text('payout_id').references(() => payouts.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    // Zadań nie kasujemy: archiwum to zwykły wiersz z ustawioną datą.
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('tasks_archived_at_idx').on(table.archivedAt),
    index('tasks_assignee_id_idx').on(table.assigneeId),
    index('tasks_payout_id_idx').on(table.payoutId),
    // Jedno zadanie na dzień wystąpienia reguły, nawet gdy harmonogram ruszy dwa razy. NULL-e się nie kłócą.
    uniqueIndex('tasks_recurrence_due_on_idx').on(table.recurrenceId, table.dueOn),
  ],
);

export const recurrences = sqliteTable('recurrences', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  assigneeId: text('assignee_id').references(() => users.id),
  pattern: text('pattern', { mode: 'json' }).$type<RecurrencePattern>().notNull(),
  // Dzień RRRR-MM-DD, od którego reguła działa i od którego liczy się „co N dni”.
  startOn: text('start_on').notNull(),
  // Kursor harmonogramu: ostatni obsłużony dzień wystąpienia, z zadaniem albo pominięty. Wcześniejszych nie tworzymy.
  lastDueOn: text('last_due_on').notNull(),
  pausedAt: integer('paused_at', { mode: 'timestamp_ms' }),
  // Ostatni dzień pauzy. Puste przy pauzie bez końca.
  pausedUntil: text('paused_until'),
  createdById: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  // Usunięta reguła zostaje w bazie, bo wskazują na nią utworzone zadania.
  archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
});

export const taskEvents = sqliteTable(
  'task_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    type: text('type').$type<'created' | 'updated'>().notNull(),
    changes: text('changes', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    // Kto wprowadził zmianę. Puste w historii sprzed etapu 3 i przy zadaniach tworzonych przez harmonogram.
    actorId: text('actor_id').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('task_events_task_id_idx').on(table.taskId)],
);

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  login: text('login').notNull().unique(),
  // Format: scrypt$N$r$p$sól$skrót, patrz auth/password.ts.
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<UserRole>().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  // Kont nie kasujemy: wyłączone konto nie może się zalogować.
  disabledAt: integer('disabled_at', { mode: 'timestamp_ms' }),
  // Kolor osoby z ustawień, jedna z nazw PERSON_COLORS. Pusty: przydział według kolejności kont.
  color: text('color').$type<PersonColor>(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    // SHA-256 tokenu z cookie. Sam token nie trafia do bazy, więc wyciek bazy nie daje dostępu.
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId), index('sessions_expires_at_idx').on(table.expiresAt)],
);

/**
 * Dziennik logowań i zmian kont. Wyjątek od zasady „nic nie kasujemy”: wpisy starsze niż 90 dni usuwa harmonogram,
 * bo adres IP to dana osobowa, a dziennik nie jest daną rodziny. Wpisany login, który nie pasuje do żadnego konta,
 * nie jest zapisywany: ludzie wpisują czasem hasło w pole loginu.
 */
export const authEvents = sqliteTable(
  'auth_events',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    type: text('type').$type<AuthEventType>().notNull(),
    // Konto, którego dotyczy wpis; puste, gdy login nie istnieje.
    userId: text('user_id').references(() => users.id),
    // Kto wykonał operację; puste przy logowaniu i operacjach z CLI.
    actorId: text('actor_id').references(() => users.id),
    ip: text('ip'),
    userAgent: text('user_agent'),
    // Krótki kod uzupełniający, np. powód nieudanego logowania (`bad_password`) albo zakres blokady (`pair`).
    detail: text('detail'),
  },
  (table) => [index('auth_events_created_at_idx').on(table.createdAt), index('auth_events_user_id_idx').on(table.userId)],
);

/**
 * Jednorazowe zaproszenia: nowe konto (`new_account`) albo nowe hasło dla istniejącego (`password_reset`).
 * W bazie jest tylko skrót tokenu, jak przy sesjach. Zaproszeń nie kasujemy: użyte, unieważnione albo wygasłe
 * zostaje z datą, a jego skrót jest wtedy bezużyteczny.
 */
export const invites = sqliteTable(
  'invites',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    // Rodzic, który wystawił zaproszenie.
    createdById: text('created_by')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    kind: text('kind').$type<InviteKind>().notNull(),
    // Dane nowego konta; przy `password_reset` login i imię są kopią z konta, a rola pusta.
    login: text('login').notNull(),
    name: text('name').notNull(),
    role: text('role').$type<UserRole>(),
    // Konto, którego dotyczy nowe hasło; przy `new_account` puste do przyjęcia, potem wskazuje założone konto.
    userId: text('user_id').references(() => users.id),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    usedAt: integer('used_at', { mode: 'timestamp_ms' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  },
  (table) => [uniqueIndex('invites_token_hash_idx').on(table.tokenHash), index('invites_expires_at_idx').on(table.expiresAt)],
);

export const shoppingItems = sqliteTable(
  'shopping_items',
  {
    // Nadawany na telefonie, żeby ponowione dodanie nie zrobiło duplikatu.
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    // Nazwa małymi literami, bez zbędnych spacji. Łączy w podpowiedziach „Mleko” i „mleko”.
    nameKey: text('name_key').notNull(),
    quantity: text('quantity'),
    checkedAt: integer('checked_at', { mode: 'timestamp_ms' }),
    checkedById: text('checked_by').references(() => users.id),
    // Czas ostatniej zmiany odhaczenia i ostatniej edycji nazwy lub ilości, według telefonu.
    // Zmiana zrobiona bez sieci przychodzi później, ale ze swoim czasem; starsza nie nadpisuje nowszej.
    // Puste: od dodania nic się nie zmieniło.
    checkedChangedAt: integer('checked_changed_at', { mode: 'timestamp_ms' }),
    editedAt: integer('edited_at', { mode: 'timestamp_ms' }),
    addedById: text('added_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    // Wyczyszczone z koszyka albo usunięte z listy. Kupione zostają w bazie jako historia dla podpowiedzi.
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('shopping_items_archived_at_idx').on(table.archivedAt),
    index('shopping_items_name_key_idx').on(table.nameKey),
  ],
);

// Stała kwota kieszonkowego na tydzień. Wiersz obowiązuje od swojego tygodnia do następnej zmiany,
// więc podwyżka nie działa wstecz. Dziecko bez żadnego wiersza ma DEFAULT_ALLOWANCE.
export const allowanceRates = sqliteTable(
  'allowance_rates',
  {
    childId: text('child_id')
      .notNull()
      .references(() => users.id),
    // Poniedziałek RRRR-MM-DD pierwszego tygodnia z tą kwotą.
    effectiveFrom: text('effective_from').notNull(),
    // Pełne złote. Zero: bez kieszonkowego, same nagrody.
    amount: integer('amount').notNull(),
    setById: text('set_by')
      .notNull()
      .references(() => users.id),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.childId, table.effectiveFrom] })],
);

// Wypłata oznaczona przez rodzica. Kwoty są zapisane na stałe: późniejsze zmiany zadań ich nie ruszają.
// Cofnięta wypłata zostaje w bazie z `cancelled_at`, a jej zadania wracają do niewypłaconych.
export const payouts = sqliteTable(
  'payouts',
  {
    id: text('id').primaryKey(),
    childId: text('child_id')
      .notNull()
      .references(() => users.id),
    // Poniedziałek RRRR-MM-DD tygodnia, za który jest wypłata.
    weekStart: text('week_start').notNull(),
    base: integer('base').notNull(),
    rewards: integer('rewards').notNull(),
    paidById: text('paid_by')
      .notNull()
      .references(() => users.id),
    paidAt: integer('paid_at', { mode: 'timestamp_ms' }).notNull(),
    cancelledById: text('cancelled_by').references(() => users.id),
    cancelledAt: integer('cancelled_at', { mode: 'timestamp_ms' }),
  },
  // Jedna ważna wypłata na dziecko i tydzień; cofnięte nie blokują ponownego oznaczenia.
  (table) => [uniqueIndex('payouts_child_week_active_idx').on(table.childId, table.weekStart).where(sql`cancelled_at IS NULL`)],
);

// Kalendarz ICS z linku. Link jest poświadczeniem: trzymamy go tylko zaszyfrowanego i nigdy nie zwracamy w API.
export const calendars = sqliteTable(
  'calendars',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    // Format `v1:<iv>:<tag>:<szyfrogram>`, patrz calendars/crypto.ts. Pusty po archiwizacji i w kalendarzu z demo.
    urlEnc: text('url_enc').notNull(),
    // Sam host do pokazania w interfejsie, np. calendar.google.com.
    urlHost: text('url_host').notNull(),
    scope: text('scope').$type<CalendarScope>().notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp_ms' }),
    lastSuccessAt: integer('last_success_at', { mode: 'timestamp_ms' }),
    // Kod błędu ostatniej próby, nigdy adres ani treść błędu.
    lastError: text('last_error').$type<CalendarErrorCode>(),
    // Kolejne nieudane próby: im więcej, tym dłuższy odstęp do następnej.
    failures: integer('failures').notNull().default(0),
    nextSyncAt: integer('next_sync_at', { mode: 'timestamp_ms' }),
    etag: text('etag'),
    lastModified: text('last_modified'),
    // Skrót pliku i dzień, dla którego rozwinięto wystąpienia: okno przesuwa się codziennie.
    contentHash: text('content_hash'),
    syncedDay: text('synced_day'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    // Odpięty kalendarz zostaje w bazie, ale bez linku.
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('calendars_archived_at_idx').on(table.archivedAt)],
);

// Rozwinięte wystąpienia z okna od wczoraj do 45 dni. Każda synchronizacja podmienia je w jednej transakcji.
export const calendarEvents = sqliteTable(
  'calendar_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    calendarId: text('calendar_id')
      .notNull()
      .references(() => calendars.id),
    uid: text('uid').notNull(),
    // Odróżnia wystąpienia jednej serii; puste przy wydarzeniu jednorazowym.
    instance: text('instance').notNull(),
    title: text('title').notNull(),
    location: text('location'),
    allDay: integer('all_day', { mode: 'boolean' }).notNull(),
    // Chwile UTC. Puste przy wydarzeniach całodniowych.
    startsAt: integer('starts_at', { mode: 'timestamp_ms' }),
    endsAt: integer('ends_at', { mode: 'timestamp_ms' }),
    // Dni RRRR-MM-DD w Europe/Warsaw, obie granice włącznie, także dla wydarzeń z godziną.
    startOn: text('start_on').notNull(),
    endOn: text('end_on').notNull(),
  },
  (table) => [
    uniqueIndex('calendar_events_instance_idx').on(table.calendarId, table.uid, table.instance),
    index('calendar_events_end_on_idx').on(table.endOn),
  ],
);

// Urządzenie z włączonymi powiadomieniami. Endpoint jest unikalny: ten sam telefon po zmianie konta zmienia właściciela.
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    lastSuccessAt: integer('last_success_at', { mode: 'timestamp_ms' }),
    // Kod odpowiedzi usługi push albo `network`. Subskrypcja z 404 i 410 jest usuwana od razu.
    lastError: text('last_error'),
    // Kolejne nieudane wysyłki. Po zbyt wielu z rzędu urządzenie jest uznawane za martwe i usuwane.
    failures: integer('failures').notNull().default(0),
  },
  (table) => [uniqueIndex('push_subscriptions_endpoint_idx').on(table.endpoint), index('push_subscriptions_user_id_idx').on(table.userId)],
);

// Ustawienia powiadomień osoby. Brak wiersza oznacza ustawienia domyślne z `DEFAULT_NOTIFICATION_PREFS`.
export const notificationPrefs = sqliteTable('notification_prefs', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id),
  morning: integer('morning', { mode: 'boolean' }).notNull(),
  assigned: integer('assigned', { mode: 'boolean' }).notNull(),
  due: integer('due', { mode: 'boolean' }).notNull(),
  morningHour: integer('morning_hour').notNull(),
  quietFrom: integer('quiet_from').notNull(),
  quietTo: integer('quiet_to').notNull(),
});

// Dziennik wysłanych powiadomień. Unikalny `dedupe_key` (np. `morning:2026-11-10:<osoba>`) chroni przed podwójną wysyłką,
// także po restarcie serwera: wiersz powstaje przed wysyłką, więc drugie uruchomienie zadania go nie zajmie.
export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind').$type<NotificationLogKind>().notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    url: text('url').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    // Puste, gdy żadne urządzenie nie przyjęło powiadomienia (brak subskrypcji albo błąd).
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
  },
  (table) => [uniqueIndex('notifications_dedupe_key_idx').on(table.dedupeKey), index('notifications_user_id_idx').on(table.userId)],
);
