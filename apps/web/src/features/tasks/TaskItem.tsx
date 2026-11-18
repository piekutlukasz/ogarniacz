import {
  type FamilyMember,
  type Task,
  type TaskStatus,
  type UpdateTask,
  type User,
  PREVIOUS_STATUS,
  canChangeTask,
  canReleaseTask,
  canRenameTask,
  canTakeTask,
  TITLE_MAX_LENGTH,
  isOverdue,
  titleProblem,
} from '@ogarniacz/shared';
import { type FormEvent, type HTMLAttributes, type Ref, useState } from 'react';
import { Avatar, personColor } from '../../lib/Avatar';
import { useHasChildren } from './api';
import { formatDue } from './format';
import { RewardBadge, RewardPicker } from './Reward';
import { ColorPicker, cardBackground } from './TaskColor';

const NEXT_ACTION: Record<TaskStatus, { label: string; change: UpdateTask }> = {
  todo: { label: 'Zacznij', change: { status: 'in_progress' } },
  in_progress: { label: 'Zakończ', change: { status: 'done' } },
  done: { label: 'Archiwizuj', change: { archived: true } },
};

type TaskItemProps = {
  task: Task;
  user: User;
  family: FamilyMember[];
  today: string;
  onChange: (change: UpdateTask) => void;
  /** Podpięcie przeciągania z tablicy. Bez niego karta działa tylko przyciskami. */
  drag?: TaskDrag;
};

export type TaskDrag = {
  ref: Ref<HTMLLIElement>;
  listeners?: HTMLAttributes<HTMLLIElement>;
  isDragging: boolean;
};

export function TaskItem({ task, user, family, today, onChange, drag }: TaskItemProps) {
  const [editing, setEditing] = useState(false);
  const canChange = canChangeTask(user, task);
  // Zadanie bez osoby dziecko może zrealizować, a zmiana statusu przypisze je do niego.
  const canAdvance = canChange || canTakeTask(user, task);
  const next = NEXT_ACTION[task.status];
  // Dziecko nie widzi przycisków, które API i tak by odrzuciło.
  const action = !canAdvance || (next.change.archived && user.role !== 'parent') ? undefined : next;
  const previous = canChange ? PREVIOUS_STATUS[task.status] : undefined;
  const canRelease = canReleaseTask(user, task);
  const overdue = isOverdue(task, today);
  const member = family.find((item) => item.id === task.assigneeId);
  const assignee = task.assigneeId ? (member?.name ?? 'Konto wyłączone') : 'Dla chętnych';
  const done = task.status === 'done';
  const hasChildren = useHasChildren();

  return (
    <li
      ref={drag?.ref}
      {...(editing ? {} : drag?.listeners)}
      // Karteczki są lekko przekrzywione na zmianę, jak przypięte magnesem. W edycji leżą prosto.
      className={`rounded-2xl p-3 shadow-card transition-[transform,opacity] ${
        cardBackground(task.color, { done, overdue })
      } ${overdue ? 'ring-2 ring-brand/25' : ''} ${editing ? '' : 'odd:-rotate-(--tilt) even:rotate-(--tilt)'} ${
        drag ? 'select-none [-webkit-touch-callout:none]' : ''
      } ${drag?.isDragging ? 'opacity-30' : ''}`}
    >
      <div className="flex items-center gap-3">
        <Avatar name={member?.name} color={personColor(family, task.assigneeId)} done={done} />
        {/*
          Gotowe przygasa tylko tytuł, przekreślony i w kolorze opisu: przyciski obok zostają wyraźne, bo dalej działają,
          a przezroczystość całej treści odebrałaby kontrast opisowi pod tytułem.
        */}
        <div className="min-w-0 flex-1">
          {canChange ? (
            <button
              type="button"
              aria-expanded={editing}
              onClick={() => setEditing((value) => !value)}
              className={`text-left leading-snug font-bold break-words ${done ? 'text-ink-muted line-through decoration-2' : ''}`}
            >
              {task.title}
            </button>
          ) : (
            <span className={`leading-snug font-bold break-words ${done ? 'text-ink-muted line-through decoration-2' : ''}`}>{task.title}</span>
          )}
          <TaskMeta
            assignee={assignee}
            dueOn={task.dueOn}
            today={today}
            overdue={overdue}
            recurring={task.recurrenceId !== null}
            reward={hasChildren ? task.reward : null}
          />
        </div>
        {!editing && (
          <div className="flex shrink-0 items-center gap-1">
            {previous && (
              <button
                type="button"
                onClick={() => onChange({ status: previous })}
                className="rounded-full px-2.5 py-2 text-sm font-semibold text-ink-muted active:bg-paper-deep"
              >
                Cofnij
              </button>
            )}
            {canRelease && (
              <button
                type="button"
                onClick={() => onChange({ assigneeId: null })}
                className="rounded-full px-2.5 py-2 text-sm font-semibold text-ink-muted active:bg-paper-deep"
              >
                Oddaj
              </button>
            )}
            {action && (
              <button
                type="button"
                onClick={() => onChange(action.change)}
                className="rounded-full bg-ink px-3.5 py-2 text-sm font-bold text-paper transition-transform active:scale-95"
              >
                {action.label}
              </button>
            )}
          </div>
        )}
      </div>
      {editing && (
        <TaskEditor
          task={task}
          user={user}
          family={family}
          onCancel={() => setEditing(false)}
          onSave={(change) => {
            setEditing(false);
            if (Object.keys(change).length > 0) onChange(change);
          }}
        />
      )}
    </li>
  );
}

type TaskMetaProps = {
  assignee: string;
  dueOn: string | null;
  today: string;
  overdue: boolean;
  recurring: boolean;
  reward: number | null;
};

function TaskMeta({ assignee, dueOn, today, overdue, recurring, reward }: TaskMetaProps) {
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8125rem] text-ink-muted">
      {reward !== null && <RewardBadge reward={reward} />}
      <span>{assignee}</span>
      {recurring && <span title="Zadanie cykliczne">↻ cykliczne</span>}
      {dueOn && (
        <span className={overdue ? 'font-bold text-brand' : ''}>
          {overdue ? 'Zaległe: ' : 'Termin: '}
          {formatDue(dueOn, today)}
        </span>
      )}
    </p>
  );
}

type TaskEditorProps = {
  task: Task;
  user: User;
  family: FamilyMember[];
  onCancel: () => void;
  onSave: (change: UpdateTask) => void;
};

function TaskEditor({ task, user, family, onCancel, onSave }: TaskEditorProps) {
  const [title, setTitle] = useState(task.title);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId);
  const [dueOn, setDueOn] = useState(task.dueOn);
  const [reward, setReward] = useState(task.reward);
  const [color, setColor] = useState(task.color);
  const [problem, setProblem] = useState<string>();
  const canRename = canRenameTask(user, task);
  const hasChildren = useHasChildren();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const titleChanged = title.trim() !== task.title;
    // Stary, za krótki tytuł wolno zostawić; sprawdzamy tylko nowo wpisany.
    const titleError = titleChanged ? titleProblem(title) : undefined;
    if (titleError) return setProblem(titleError);
    // Wysyłamy tylko zmienione pola, żeby historia pokazywała, co naprawdę się zmieniło.
    const change: UpdateTask = {};
    if (titleChanged) change.title = title;
    if (assigneeId !== task.assigneeId) change.assigneeId = assigneeId;
    if (dueOn !== task.dueOn) change.dueOn = dueOn;
    if (reward !== task.reward) change.reward = reward;
    if (color !== task.color) change.color = color;
    onSave(change);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2 border-t-2 border-dashed border-paper-deep pt-3">
      {canRename ? (
        <input
          aria-label="Nazwa zadania"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setProblem(undefined);
          }}
          maxLength={TITLE_MAX_LENGTH}
          aria-invalid={problem !== undefined}
          aria-describedby={problem ? `${task.id}-problem` : undefined}
          className="rounded-xl border-2 border-ink/10 bg-paper px-3 py-2 text-base outline-brand aria-invalid:border-brand"
        />
      ) : (
        <p className="text-sm text-ink-muted">Nazwę zadania z nagrodą zmienia tylko rodzic.</p>
      )}
      {problem && <FieldProblem id={`${task.id}-problem`}>{problem}</FieldProblem>}
      <div className="flex gap-2">
        {user.role === 'parent' && <AssigneeSelect family={family} value={assigneeId} onChange={setAssigneeId} />}
        <DueInput value={dueOn} onChange={setDueOn} />
      </div>
      {user.role === 'parent' && hasChildren && <RewardPicker value={reward} onChange={setReward} />}
      <ColorPicker value={color} onChange={setColor} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-full px-3 py-2 text-sm font-semibold text-ink-muted">
          Anuluj
        </button>
        <button type="submit" className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-on-brand">
          Zapisz
        </button>
      </div>
    </form>
  );
}

type AssigneeSelectProps = { family: FamilyMember[]; value: string | null; onChange: (value: string | null) => void };

export function AssigneeSelect({ family, value, onChange }: AssigneeSelectProps) {
  return (
    <select
      aria-label="Osoba"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || null)}
      className="min-w-0 flex-1 rounded-xl border-2 border-ink/10 bg-card px-2 py-2 text-base outline-brand"
    >
      <option value="">Bez osoby</option>
      {family.map((member) => (
        <option key={member.id} value={member.id}>
          {member.name}
        </option>
      ))}
    </select>
  );
}

/** Termin jest opcjonalny. Pusty pokazuje podpowiedź, ustawiony da się wyczyścić krzyżykiem. */
export function DueInput({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  return (
    <div className="relative flex min-w-0 flex-1">
      <input
        type="date"
        aria-label="Termin"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        // Pole daty nie ma placeholdera, więc pusty format „dd.mm.rrrr” chowamy pod podpowiedzią aż do kliknięcia.
        className={`peer min-w-0 flex-1 rounded-xl border-2 border-ink/10 bg-card px-2 py-2 text-base outline-brand ${
          value ? 'pr-9' : 'text-transparent focus:text-ink [&::-webkit-datetime-edit]:text-transparent [&:focus::-webkit-datetime-edit]:text-ink'
        }`}
      />
      {value ? (
        <button
          type="button"
          aria-label="Usuń termin"
          title="Usuń termin"
          onClick={() => onChange(null)}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-xl text-lg text-ink-muted"
        >
          ×
        </button>
      ) : (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-8 left-2.5 flex items-center truncate text-base whitespace-nowrap text-ink-muted peer-focus:hidden"
        >
          Termin
        </span>
      )}
    </div>
  );
}

/** Komunikat walidacji pod polem formularza. */
export function FieldProblem({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} role="alert" className="text-sm font-semibold text-brand">
      {children}
    </p>
  );
}
