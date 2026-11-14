import type { Allowance, AllowanceReward, AllowanceWeek, FamilyMember, User } from '@ogarniacz/shared';
import { type ReactNode, useState } from 'react';
import { Avatar, personColor } from '../../lib/Avatar';
import { ErrorNote } from '../../lib/ErrorNote';
import { useFamily } from '../tasks/api';
import { formatDue } from '../tasks/format';
import { RewardBadge, zl } from '../tasks/Reward';
import { useAllowance, useMarkPayout } from './api';
import { formatDay, formatWeek, formatWeekday, taskCount } from './format';
import { RatesSheet } from './RatesSheet';

/** Kieszonkowe: dziecko widzi, ile dostanie w poniedziałek, a rodzic, ile komu wypłacić. */
export function AllowanceScreen({ user }: { user: User }) {
  const allowanceQuery = useAllowance();
  const family = useFamily().data ?? [];

  if (allowanceQuery.isPending) return <p className="text-ink/60">Wczytuję kieszonkowe…</p>;
  if (allowanceQuery.isError) return <ErrorNote />;

  return user.role === 'parent' ? (
    <ParentAllowance allowance={allowanceQuery.data} family={family} />
  ) : (
    <ChildAllowance allowance={allowanceQuery.data} />
  );
}

function rewardSum(week: AllowanceWeek): number {
  return week.total - week.base;
}

/** Z czego składa się kwota, np. „50 + 10 za 1 zadanie”. */
function breakdown(week: AllowanceWeek): string {
  const rewards = rewardSum(week);
  if (rewards === 0) return week.base === 0 ? 'bez kieszonkowego i nagród' : `${week.base}, bez nagród`;
  const forTasks = `${rewards} za ${taskCount(week.rewards.length)}`;
  return week.base === 0 ? `same nagrody: ${forTasks}` : `${week.base} + ${forTasks}`;
}

function ChildAllowance({ allowance }: { allowance: Allowance }) {
  const mine = allowance.children[0];
  if (!mine) return <ErrorNote />;

  const { current, closed } = mine;
  const waiting = closed.filter((week) => week.paidAt === null);
  const lastPaid = closed.find((week) => week.paidAt !== null);

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="allowance-next" className="-rotate-[0.4deg] rounded-2xl bg-card p-4 shadow-card">
        <h2 id="allowance-next" className="text-sm font-semibold text-ink/55">
          W poniedziałek {formatDay(current.payoutOn)} dostaniesz
        </h2>
        <p className="mt-1 text-5xl leading-none font-extrabold tracking-tight">{zl(current.total)}</p>
        <dl className="mt-4 flex flex-col text-[0.9375rem]">
          <Line label="Kieszonkowe" value={zl(current.base)} />
          <Line label="Nagrody za zadania" value={zl(rewardSum(current))} />
        </dl>
      </section>

      {waiting.map((week) => (
        <p key={week.weekStart} className="rounded-2xl bg-brand-soft px-3.5 py-2.5 text-sm font-semibold text-brand">
          Czeka na wypłatę: {zl(week.total)} za {formatWeek(week.weekStart)}
        </p>
      ))}

      <section aria-labelledby="allowance-earned" className="flex flex-col gap-2">
        <h3 id="allowance-earned" className="font-extrabold">
          Zarobione w tym tygodniu
        </h3>
        {current.rewards.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-paper-deep px-3 py-6 text-center text-ink/50">
            Jeszcze nic. Nagrodę dostajesz, gdy zadanie z żółtą plakietką trafi do „Gotowe”.
          </p>
        ) : (
          <RewardList rewards={current.rewards} today={allowance.date} />
        )}
      </section>

      {allowance.open.length > 0 && (
        <section aria-labelledby="allowance-open" className="flex flex-col gap-2">
          <h3 id="allowance-open" className="font-extrabold">
            Możesz jeszcze zarobić
          </h3>
          <ul className="flex flex-col gap-2">
            {allowance.open.map((task) => (
              <li key={task.taskId} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-card">
                <div className="min-w-0 flex-1">
                  <span className="font-bold break-words">{task.title}</span>
                  <p className="text-[0.8125rem] text-ink/55">
                    {[task.forAnyone ? 'dla chętnych' : 'Twoje zadanie', task.dueOn && `termin: ${formatDue(task.dueOn, allowance.date)}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <RewardBadge reward={task.reward} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {lastPaid && (
        <p className="text-center text-sm text-ink/55">
          Ostatnia wypłata: {zl(lastPaid.total)} za {formatWeek(lastPaid.weekStart)}
        </p>
      )}
    </div>
  );
}

function ParentAllowance({ allowance, family }: { allowance: Allowance; family: FamilyMember[] }) {
  const [ratesOpen, setRatesOpen] = useState(false);
  // Wypłaty nie da się cofnąć, więc przycisk prosi o drugie stuknięcie.
  const [confirming, setConfirming] = useState<string>();
  const markPayout = useMarkPayout();

  const nameOf = (id: string) => family.find((member) => member.id === id)?.name ?? 'Dziecko';
  const { children } = allowance;
  const current = children[0]?.current;

  if (!current) {
    return <p className="rounded-2xl border-2 border-dashed border-paper-deep py-10 text-center text-ink/50">Nie ma jeszcze kont dzieci.</p>;
  }

  const closed = children.flatMap((child) => child.closed.map((week) => ({ childId: child.childId, week })));
  const unpaid = closed.filter(({ week }) => week.paidAt === null);
  const paid = closed.filter(({ week }) => week.paidAt !== null).sort((a, b) => b.week.weekStart.localeCompare(a.week.weekStart));
  const unpaidWeeks = [...new Set(unpaid.map(({ week }) => week.weekStart))].sort().reverse();
  const unpaidTotal = unpaid.reduce((sum, { week }) => sum + week.total, 0);

  return (
    <div className="flex flex-col gap-5">
      {unpaidWeeks.map((weekStart) => {
        const rows = unpaid.filter(({ week }) => week.weekStart === weekStart);
        const isToday = rows[0]?.week.payoutOn === allowance.date;
        return (
          <section key={weekStart} aria-label={`Do wypłaty za ${formatWeek(weekStart)}`} className="flex flex-col gap-2">
            <h3 className="font-extrabold">
              {isToday ? 'Do wypłaty dziś' : 'Czeka na wypłatę'}
              <span className="font-normal text-ink/55"> · za {formatWeek(weekStart)}</span>
            </h3>
            <ul className="flex flex-col gap-2">
              {rows.map(({ childId, week }) => {
                const key = `${childId}:${weekStart}`;
                const isConfirming = confirming === key;
                return (
                  <li key={key} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-card">
                    <Avatar name={nameOf(childId)} color={personColor(family, childId)} />
                    <div className="min-w-0 flex-1">
                      <span className="font-bold break-words">
                        {nameOf(childId)} · {zl(week.total)}
                      </span>
                      <p className="text-[0.8125rem] text-ink/55">{breakdown(week)}</p>
                    </div>
                    <button
                      type="button"
                      disabled={markPayout.isPending}
                      onBlur={() => setConfirming(undefined)}
                      onClick={() => {
                        if (!isConfirming) return setConfirming(key);
                        setConfirming(undefined);
                        markPayout.mutate({ childId, weekStart });
                      }}
                      className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-bold transition-transform active:scale-95 disabled:opacity-60 ${
                        isConfirming ? 'bg-brand text-on-brand' : 'bg-ink text-paper'
                      }`}
                    >
                      {isConfirming ? 'Potwierdź' : 'Wypłacone'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {unpaid.length > 1 && (
        <p className="-mt-2 flex items-center justify-between px-1">
          <span className="text-sm text-ink/60">Razem do przygotowania</span>
          <span className="text-lg font-extrabold">{zl(unpaidTotal)}</span>
        </p>
      )}
      {markPayout.isError && <ErrorNote error={markPayout.error} />}

      <section aria-labelledby="allowance-week" className="flex flex-col gap-2">
        <h3 id="allowance-week" className="font-extrabold">
          Ten tydzień
          <span className="font-normal text-ink/55"> · wypłata {formatDay(current.payoutOn)}</span>
        </h3>
        <ul className="flex flex-col gap-2">
          {children.map(({ childId, current: week }) => (
            <li key={childId} className="rounded-2xl bg-card p-3 shadow-card">
              <div className="flex items-center gap-3">
                <Avatar name={nameOf(childId)} color={personColor(family, childId)} />
                <div className="min-w-0 flex-1">
                  <span className="font-bold break-words">{nameOf(childId)}</span>
                  <p className="text-[0.8125rem] text-ink/55">{breakdown(week)}</p>
                </div>
                <span className="shrink-0 text-lg font-extrabold">{zl(week.total)}</span>
              </div>
              {week.rewards.length > 0 && (
                <ul className="mt-2 flex flex-col">
                  {week.rewards.map((item) => (
                    <li key={item.taskId} className="flex items-center justify-between gap-3 border-t-2 border-dashed border-paper-deep py-1.5 text-[0.9375rem]">
                      <span className="min-w-0 break-words">{item.title}</span>
                      <RewardBadge reward={item.reward} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="allowance-rates" className="flex items-center gap-3 rounded-2xl bg-paper-deep p-3">
        <div className="min-w-0 flex-1">
          <h3 id="allowance-rates" className="text-sm font-extrabold">
            Kieszonkowe na tydzień
          </h3>
          <p className="text-sm text-ink/65">{children.map((child) => `${nameOf(child.childId)} ${zl(child.current.base)}`).join(' · ')}</p>
        </div>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setRatesOpen(true)}
          className="shrink-0 rounded-full bg-card px-3.5 py-2 text-sm font-bold shadow-card transition-transform active:scale-95"
        >
          Zmień
        </button>
      </section>

      {paid.length > 0 && (
        <section aria-labelledby="allowance-paid" className="flex flex-col gap-1">
          <h3 id="allowance-paid" className="text-sm font-extrabold text-ink/60">
            Ostatnie wypłaty
          </h3>
          <ul className="flex flex-col text-sm text-ink/60">
            {paid.map(({ childId, week }) => (
              <li key={`${childId}:${week.weekStart}`} className="flex justify-between gap-3 py-0.5">
                <span>
                  {nameOf(childId)} · za {formatWeek(week.weekStart)}
                </span>
                <span className="font-bold">{zl(week.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ratesOpen && (
        <RatesSheet
          kids={children.map((child) => ({
            id: child.childId,
            name: nameOf(child.childId),
            color: personColor(family, child.childId),
            amount: child.current.base,
          }))}
          effectiveOn={current.payoutOn}
          onClose={() => setRatesOpen(false)}
        />
      )}
    </div>
  );
}

function RewardList({ rewards, today }: { rewards: AllowanceReward[]; today: string }) {
  return (
    <ul className="flex flex-col gap-2">
      {rewards.map((item) => (
        <li key={item.taskId} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-card">
          <div className="min-w-0 flex-1">
            <span className="font-bold break-words">{item.title}</span>
            <p className="text-[0.8125rem] text-ink/55">
              gotowe {item.completedOn === today ? 'dziś' : formatWeekday(item.completedOn)}
            </p>
          </div>
          <RewardBadge reward={item.reward} />
        </li>
      ))}
    </ul>
  );
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-t-2 border-dashed border-paper-deep py-1.5">
      <dt>{label}</dt>
      <dd className="font-bold">{value}</dd>
    </div>
  );
}
