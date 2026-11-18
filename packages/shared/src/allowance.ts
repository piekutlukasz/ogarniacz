import { z } from 'zod';
import { dueOnSchema, rewardSchema } from './tasks';
import { addDays, weekStart } from './time';

/** Kieszonkowe dziecka, dopóki rodzic nie ustawi innej kwoty. */
export const DEFAULT_ALLOWANCE = 50;
export const ALLOWANCE_MAX = 500;
/** Ile zamkniętych tygodni wstecz pokazujemy, żeby niewypłacony tydzień nie zniknął po jednym poniedziałku. */
export const ALLOWANCE_WEEKS_BACK = 4;

/** Stała kwota na tydzień w pełnych złotych. Zero wyłącza kieszonkowe, zostają same nagrody. */
export const allowanceAmountSchema = z
  .number()
  .int('Kieszonkowe to pełne złote')
  .min(0, 'Kieszonkowe nie może być ujemne')
  .max(ALLOWANCE_MAX, `Kieszonkowe może mieć najwyżej ${ALLOWANCE_MAX} zł`);

/** Ukończone zadanie z nagrodą, doliczone do tygodnia. */
export const allowanceRewardSchema = z.object({
  taskId: z.uuid(),
  title: z.string(),
  reward: rewardSchema,
  /** Dzień ukończenia w strefie Europe/Warsaw. Od niego zależy, do którego tygodnia trafia nagroda. */
  completedOn: dueOnSchema,
});
export type AllowanceReward = z.infer<typeof allowanceRewardSchema>;

export const allowanceWeekSchema = z.object({
  /** Poniedziałek tygodnia, w którym dziecko zbiera nagrody. */
  weekStart: dueOnSchema,
  /** Poniedziałek po tym tygodniu: dzień wypłaty. */
  payoutOn: dueOnSchema,
  /** Stała kwota obowiązująca w tym tygodniu. Późniejsza zmiana stawki jej nie rusza. */
  base: allowanceAmountSchema,
  rewards: z.array(allowanceRewardSchema),
  /** `base` plus suma nagród. Po wypłacie to kwota zapisana w chwili oznaczenia. */
  total: z.number().int(),
  /** Kiedy rodzic oznaczył wypłatę; `null`, gdy jeszcze nie. */
  paidAt: z.iso.datetime().nullable(),
});
export type AllowanceWeek = z.infer<typeof allowanceWeekSchema>;

/** Otwarte zadanie z nagrodą, które dziecko może jeszcze zrobić: swoje albo dla chętnych. */
export const allowanceOpenTaskSchema = z.object({
  taskId: z.uuid(),
  title: z.string(),
  reward: rewardSchema,
  dueOn: dueOnSchema.nullable(),
  forAnyone: z.boolean(),
});
export type AllowanceOpenTask = z.infer<typeof allowanceOpenTaskSchema>;

export const childAllowanceSchema = z.object({
  childId: z.uuid(),
  /** Trwający tydzień, wypłata w najbliższy poniedziałek. */
  current: allowanceWeekSchema,
  /** Zamknięte tygodnie od najnowszego: wypłacone i czekające na wypłatę. */
  closed: z.array(allowanceWeekSchema),
});
export type ChildAllowance = z.infer<typeof childAllowanceSchema>;

export const allowanceSchema = z.object({
  /** Dzisiejsza data w strefie Europe/Warsaw według serwera. */
  date: dueOnSchema,
  /** Rodzic dostaje wszystkie dzieci, dziecko tylko siebie. */
  children: z.array(childAllowanceSchema),
  /** Tylko dla dziecka; rodzic dostaje pustą listę. */
  open: z.array(allowanceOpenTaskSchema),
});
export type Allowance = z.infer<typeof allowanceSchema>;

/** Nowe stawki. Obowiązują od trwającego tygodnia; zamknięte tygodnie zostają po starej. */
export const setAllowanceRatesSchema = z.object({
  rates: z.array(z.object({ childId: z.uuid(), amount: allowanceAmountSchema })).min(1),
});
export type SetAllowanceRates = z.infer<typeof setAllowanceRatesSchema>;

export const markPayoutSchema = z.object({
  childId: z.uuid(),
  weekStart: dueOnSchema,
});
export type MarkPayout = z.infer<typeof markPayoutSchema>;

/** Cofnięcie pomyłkowo oznaczonej wypłaty: to samo dziecko i tydzień co przy oznaczeniu. */
export const cancelPayoutSchema = markPayoutSchema;
export type CancelPayout = MarkPayout;

/** Dzień wypłaty za tydzień zaczynający się w `start`: następny poniedziałek. */
export function payoutDay(start: string): string {
  return addDays(start, 7);
}

/** Tydzień jest zamknięty, gdy minęła jego niedziela. Tylko taki można oznaczyć jako wypłacony. */
export function isClosedWeek(start: string, today: string): boolean {
  return start < weekStart(today);
}
