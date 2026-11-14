import type { User } from '@ogarniacz/shared';
import { useQuery } from '@tanstack/react-query';
import { Avatar, personColor } from '../../lib/Avatar';
import { ErrorNote } from '../../lib/ErrorNote';
import { ARCHIVED_TASKS_KEY, fetchArchivedTasks, useFamily } from './api';
import { useChangeTask } from './hooks';
import { zl } from './Reward';

const archivedAt = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'short' });

export function ArchiveView({ user, onBack }: { user: User; onBack: () => void }) {
  const archiveQuery = useQuery({ queryKey: ARCHIVED_TASKS_KEY, queryFn: fetchArchivedTasks });
  const family = useFamily().data ?? [];
  const restore = useChangeTask();

  const nameOf = (id: string | null) => family.find((member) => member.id === id)?.name;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          // W nawigacji jest już przycisk „Tablica”, więc ten nazywa się inaczej dla czytnika ekranu.
          aria-label="Wróć na tablicę"
          className="flex shrink-0 items-center gap-1 rounded-full bg-card py-1.5 pr-3.5 pl-2.5 text-sm font-semibold shadow-card transition-transform active:scale-95"
        >
          <span aria-hidden="true">←</span>
          Tablica
        </button>
        <h2 className="text-xl font-extrabold">Archiwum</h2>
      </div>
      <p className="text-sm text-ink/60">Ostatnie zarchiwizowane zadania, od najnowszego.</p>
      {(archiveQuery.isError || restore.isError) && <ErrorNote error={restore.error} />}
      {archiveQuery.isPending && <p className="text-ink/60">Wczytuję archiwum…</p>}
      {archiveQuery.isSuccess && archiveQuery.data.length === 0 && (
        <p className="rounded-2xl border-2 border-dashed border-paper-deep py-10 text-center text-ink/50">Archiwum jest puste.</p>
      )}
      <ul className="flex flex-col gap-2">
        {archiveQuery.data?.map((task) => (
          <li key={task.id} className="flex items-center gap-3 rounded-2xl bg-card/70 p-3 shadow-card">
            <Avatar size="sm" name={nameOf(task.assigneeId)} color={personColor(family, task.assigneeId)} />
            <div className="min-w-0 flex-1">
              <span className="font-bold break-words text-ink/80">{task.title}</span>
              <p className="mt-0.5 text-[0.8125rem] text-ink/55">
                {[task.reward !== null && `+${zl(task.reward)}`, nameOf(task.assigneeId), task.archivedAt && `zarchiwizowane ${archivedAt.format(new Date(task.archivedAt))}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            {user.role === 'parent' && (
              <button
                type="button"
                disabled={restore.isPending}
                onClick={() => restore.mutate({ id: task.id, change: { archived: false } })}
                className="shrink-0 rounded-full bg-brand-soft px-3.5 py-2 text-sm font-bold text-brand transition-transform active:scale-95 disabled:opacity-60"
              >
                Przywróć
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
