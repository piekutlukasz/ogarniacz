import { z } from 'zod';

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;

export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const TITLE_MIN_LENGTH = 3;
export const TITLE_MAX_LENGTH = 250;

/** Komunikat dla tytułu spoza limitu albo `undefined`, gdy tytuł jest w porządku. Ten sam w formularzach i w API. */
export function titleProblem(title: string): string | undefined {
  const length = title.trim().length;
  if (length === 0) return 'Podaj nazwę zadania';
  if (length < TITLE_MIN_LENGTH) return `Nazwa zadania musi mieć co najmniej ${TITLE_MIN_LENGTH} znaki`;
  if (length > TITLE_MAX_LENGTH) return `Nazwa zadania może mieć najwyżej ${TITLE_MAX_LENGTH} znaków`;
  return undefined;
}

/** Tytuł przy dodawaniu i zmianie: 3–250 znaków po obcięciu spacji. */
export const titleInputSchema = z
  .string()
  .trim()
  .min(TITLE_MIN_LENGTH, titleProblem('x'))
  .max(TITLE_MAX_LENGTH, titleProblem('x'.repeat(TITLE_MAX_LENGTH + 1)));

/** Zapisany tytuł. Łagodniejszy niż przy dodawaniu, bo zadania sprzed limitu 3 znaków mogą mieć krótsze. */
const storedTitleSchema = z.string().min(1);

/** Termin to dzień kalendarzowy w strefie Europe/Warsaw, bez godziny, np. `2026-11-09`. */
export const dueOnSchema = z.iso.date();

export const REWARD_MAX = 500;
/** Gotowe kwoty nagrody w formularzu. Rodzic może też wpisać własną. */
export const REWARD_PRESETS = [5, 10, 15] as const;

/** Nagroda za zadanie w pełnych złotych, doliczana do kieszonkowego dziecka. */
export const rewardSchema = z
  .number()
  .int('Nagroda to pełne złote')
  .min(1, 'Nagroda to co najmniej 1 zł')
  .max(REWARD_MAX, `Nagroda może mieć najwyżej ${REWARD_MAX} zł`);

/**
 * Kolor karteczki na tablicy, wspólny dla całej rodziny. Ozdoba: nie niesie znaczenia, którego nie ma w tekście.
 * Nazwy pokrywają się z kolorami osób, ale paleta jest osobna, żeby obie mogły się zmieniać niezależnie.
 */
export const TASK_COLORS = ['coral', 'yellow', 'mint', 'sky', 'lilac', 'pink'] as const;
export const taskColorSchema = z.enum(TASK_COLORS, 'Nieznany kolor karteczki');
export type TaskColor = z.infer<typeof taskColorSchema>;

export const taskSchema = z.object({
  id: z.uuid(),
  title: storedTitleSchema,
  status: taskStatusSchema,
  /** `null`: zadanie nie ma osoby, np. „ktoś niech to zrobi”. */
  assigneeId: z.uuid().nullable(),
  /** Kto przypisał obecną osobę; `null`, gdy zadanie nie ma osoby. */
  assignedById: z.uuid().nullable(),
  dueOn: dueOnSchema.nullable(),
  /** `null` tylko przy zadaniach sprzed etapu 3, kiedy autor nie był zapisywany. */
  createdById: z.uuid().nullable(),
  /** Reguła cykliczna, z której powstało zadanie; `null` przy zadaniach dodanych ręcznie. */
  recurrenceId: z.uuid().nullable(),
  /** Nagroda w złotych; `null`, gdy zadanie jej nie ma. Ustawia ją tylko rodzic. */
  reward: rewardSchema.nullable(),
  /** `null`: zwykła karteczka w kolorze wyglądu. */
  color: taskColorSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
});
export type Task = z.infer<typeof taskSchema>;

export const taskListSchema = z.array(taskSchema);

export const createTaskSchema = z.object({
  title: titleInputSchema,
  /** Pominięte: rodzic tworzy zadanie bez osoby, dziecko zawsze dla siebie. */
  assigneeId: z.uuid().nullable().optional(),
  dueOn: dueOnSchema.nullable().optional(),
  /** Tylko rodzic. Pominięta: zadanie bez nagrody. */
  reward: rewardSchema.nullable().optional(),
  /** Pominięty: zwykła karteczka. */
  color: taskColorSchema.nullable().optional(),
});
export type CreateTask = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: titleInputSchema,
    status: taskStatusSchema,
    assigneeId: z.uuid().nullable(),
    dueOn: dueOnSchema.nullable(),
    /** Tylko rodzic. `null` zdejmuje nagrodę. */
    reward: rewardSchema.nullable(),
    /** `null` przywraca zwykłą karteczkę. */
    color: taskColorSchema.nullable(),
    archived: z.boolean(),
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Podaj co najmniej jedno pole do zmiany',
  });
export type UpdateTask = z.infer<typeof updateTaskSchema>;

export const todaySchema = z.object({
  /** Dzisiejsza data w strefie Europe/Warsaw według serwera. */
  date: dueOnSchema,
  /** Moje niezakończone zadania z terminem przed dziś, od najstarszego. */
  overdue: taskListSchema,
  /** Moje zadania z terminem na dziś, także już zakończone. */
  today: taskListSchema,
});
export type Today = z.infer<typeof todaySchema>;

/** Zadanie jest zaległe, gdy termin minął, a nie jest zakończone. */
export function isOverdue(task: Pick<Task, 'dueOn' | 'status'>, today: string): boolean {
  return task.dueOn !== null && task.dueOn < today && task.status !== 'done';
}

/**
 * Kto może zmieniać zadanie (PROJEKT.md, rozdział 6): rodzic każde, dziecko tylko przypisane do siebie.
 * Archiwizacja i przypisywanie innych to osobne zasady, sprawdzane w API.
 */
export function canChangeTask(user: { id: string; role: 'parent' | 'child' }, task: Pick<Task, 'assigneeId'>): boolean {
  return user.role === 'parent' || task.assigneeId === user.id;
}

/**
 * Dziecko może zrealizować zadanie bez osoby: zmiana statusu przypisuje je do niego.
 * Tytułu i terminu takiego zadania nie zmienia, dopóki go nie przejmie.
 */
export function canTakeTask(user: { role: 'parent' | 'child' }, task: Pick<Task, 'assigneeId'>): boolean {
  return user.role === 'child' && task.assigneeId === null;
}

/**
 * Tytuł zadania z nagrodą zmienia tylko rodzic, żeby dziecko nie podmieniło go na łatwiejsze.
 * Poza tym obowiązuje `canChangeTask`.
 */
export function canRenameTask(
  user: { id: string; role: 'parent' | 'child' },
  task: Pick<Task, 'assigneeId' | 'reward'>,
): boolean {
  return canChangeTask(user, task) && (user.role === 'parent' || task.reward === null);
}

/** Status o krok wstecz, np. gdy ktoś kliknął „Zakończ” za wcześnie. */
export const PREVIOUS_STATUS: Record<TaskStatus, TaskStatus | undefined> = {
  todo: undefined,
  in_progress: 'todo',
  done: 'in_progress',
};

/**
 * Oddanie zadania, żeby wróciło jako „dla chętnych”: tylko swoje, tylko w „Do zrobienia”.
 * Dziecko oddaje tylko zadanie, które samo wzięło lub dodało, a nie przydzielone przez rodzica.
 */
export function canReleaseTask(
  user: { id: string; role: 'parent' | 'child' },
  task: Pick<Task, 'assigneeId' | 'assignedById' | 'status'>,
): boolean {
  return (
    task.assigneeId === user.id && task.status === 'todo' && (user.role === 'parent' || task.assignedById === user.id)
  );
}
