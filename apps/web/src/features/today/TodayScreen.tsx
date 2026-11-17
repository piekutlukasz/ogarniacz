import type { Task, User } from '@ogarniacz/shared';
import { useQuery } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { ErrorNote } from '../../lib/ErrorNote';
import { TodayEvents } from '../calendars/TodayEvents';
import { useShoppingList } from '../shopping/api';
import { TODAY_KEY, fetchToday, useFamily } from '../tasks/api';
import { useChangeTask } from '../tasks/hooks';
import { TaskItem } from '../tasks/TaskItem';

const weekday = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', weekday: 'long' });
const dayAndMonth = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', day: 'numeric', month: 'long' });

export function TodayScreen({ user, onOpenShopping }: { user: User; onOpenShopping: () => void }) {
  // Po powrocie do aplikacji następnego dnia lista musi się przeliczyć, więc odświeżamy przy powrocie na ekran.
  const todayQuery = useQuery({ queryKey: TODAY_KEY, queryFn: fetchToday, refetchOnWindowFocus: 'always' });
  const family = useFamily().data ?? [];
  const changeTask = useChangeTask();

  if (todayQuery.isPending) return <p className="text-ink-muted">Wczytuję…</p>;
  if (todayQuery.isError) return <ErrorNote />;

  const { date, overdue, today } = todayQuery.data;
  const isEmpty = overdue.length === 0 && today.length === 0;
  const day = new Date(`${date}T00:00:00Z`);
  const all = [...overdue, ...today];
  const doneCount = all.filter((task) => task.status === 'done').length;

  const renderList = (tasks: Task[]) => (
    <ul className="flex flex-col gap-2">
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          user={user}
          family={family}
          today={date}
          onChange={(change) => changeTask.mutate({ id: task.id, change })}
        />
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="today-hero">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex flex-col">
            <span className="text-sm font-semibold opacity-70">{weekday.format(day)}</span>
            <span className="text-4xl leading-none font-extrabold tracking-tight">{dayAndMonth.format(day)}</span>
          </h2>
          {all.length > 0 && (
            <div
              aria-hidden="true"
              className="look-ring"
              style={{ '--pct': Math.round((doneCount / all.length) * 100) } as CSSProperties}
            >
              <span>
                {doneCount}/{all.length}
              </span>
            </div>
          )}
        </div>
        {all.length > 0 && <Progress done={doneCount} total={all.length} />}
      </div>
      {changeTask.isError && <ErrorNote error={changeTask.error} />}

      <TodayEvents />

      {isEmpty && (
        <div className="flex flex-col items-center gap-3 py-10 text-center text-ink-muted">
          <span aria-hidden="true" className="size-16 rounded-full bg-sun shadow-[0_0_0_10px_rgb(255_201_60/0.25)]" />
          <p>Na dziś nie masz żadnych zadań z terminem.</p>
        </div>
      )}

      {overdue.length > 0 && (
        <section aria-labelledby="today-overdue" className="flex flex-col gap-2">
          <h3 id="today-overdue" className="font-extrabold text-brand">
            Zaległe ({overdue.length})
          </h3>
          {renderList(overdue)}
        </section>
      )}

      {today.length > 0 && (
        <section aria-labelledby="today-due" className="flex flex-col gap-2">
          <h3 id="today-due" className="font-extrabold">
            Moje zadania na dziś ({today.filter((task) => task.status !== 'done').length} do zrobienia)
          </h3>
          {renderList(today)}
        </section>
      )}

      <ShoppingSummary userId={user.id} onOpen={onOpenShopping} />
    </div>
  );
}

/** Ile czeka na liście zakupów i co. Całość otwiera ekran „Zakupy”. Pusta lista nie zajmuje miejsca. */
function ShoppingSummary({ userId, onOpen }: { userId: string; onOpen: () => void }) {
  const toBuy = (useShoppingList(userId).data ?? []).filter((item) => !item.checkedAt);
  if (toBuy.length === 0) return null;

  const PREVIEW = 4;
  const names = toBuy.slice(0, PREVIEW).map((item) => item.name);
  const more = toBuy.length - names.length;

  return (
    <section aria-labelledby="today-shopping" className="flex flex-col gap-2">
      <h3 id="today-shopping" className="font-extrabold">
        Zakupy ({toBuy.length} do kupienia)
      </h3>
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-3 rounded-2xl bg-card p-3 text-left shadow-card transition-transform active:scale-[0.98]"
      >
        <span className="min-w-0 flex-1 text-ink/75">
          {names.join(', ')}
          {more > 0 && ` i ${more} więcej`}
        </span>
        <span className="shrink-0 text-sm font-bold text-brand">Otwórz listę</span>
      </button>
    </section>
  );
}

/** Pasek „ile już ogarnięte”. Zadania gotowe zostają na liście do końca dnia, więc wypełnia się w trakcie dnia. */
function Progress({ done, total }: { done: number; total: number }) {
  const percent = Math.round((done / total) * 100);
  return (
    <div className="mt-4 flex items-center gap-3">
      <div
        role="progressbar"
        aria-label="Postęp na dziś"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="look-bar h-2.5 flex-1 overflow-hidden rounded-full bg-hero-track"
      >
        <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
      <span className="shrink-0 text-sm font-semibold opacity-70">
        {done === total ? 'Wszystko ogarnięte!' : `${done} z ${total} ogarnięte`}
      </span>
    </div>
  );
}
