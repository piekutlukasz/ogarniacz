import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  type FamilyMember,
  TASK_STATUSES,
  type Task,
  type TaskColor,
  type TaskStatus,
  type UpdateTask,
  type User,
  canChangeTask,
  TITLE_MAX_LENGTH,
  canTakeTask,
  taskStatusSchema,
  titleProblem,
} from '@ogarniacz/shared';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { ErrorNote } from '../../lib/ErrorNote';
import { ArchiveIcon } from '../../lib/icons';
import { ACTIVE_TASKS_KEY, fetchTasks, useFamily, useHasChildren } from './api';
import { localToday, useChangeTask, useCreateTask } from './hooks';
import { RewardPicker } from './Reward';
import { ColorPicker } from './TaskColor';
import { AssigneeSelect, DueInput, FieldProblem, TaskItem } from './TaskItem';

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Do zrobienia',
  in_progress: 'W trakcie',
  done: 'Gotowe',
};

const MINE_ONLY_STORAGE = 'ogarniacz.mineOnly';

function readMineOnly(): boolean {
  try {
    return localStorage.getItem(MINE_ONLY_STORAGE) === '1';
  } catch {
    return false;
  }
}

function saveMineOnly(value: boolean) {
  try {
    localStorage.setItem(MINE_ONLY_STORAGE, value ? '1' : '0');
  } catch {
    // Tryb prywatny Safari potrafi blokować zapis. Filtr po prostu nie zostanie zapamiętany.
  }
}

export function TaskBoard({ user, onOpenArchive }: { user: User; onOpenArchive: () => void }) {
  const [activeStatus, setActiveStatus] = useState<TaskStatus>('todo');
  const [mineOnly, setMineOnly] = useState(readMineOnly);

  const tasksQuery = useQuery({ queryKey: ACTIVE_TASKS_KEY, queryFn: fetchTasks });
  const family = useFamily().data ?? [];
  const changeTask = useChangeTask();
  const today = localToday();

  const tasks = (tasksQuery.data ?? []).filter((task) => !mineOnly || task.assigneeId === user.id);
  // Najpierw najbliższe terminy (zaległe na górze), potem zadania bez terminu od najnowszego, jak przysłało API.
  const visibleTasks = tasks
    .filter((task) => task.status === activeStatus)
    .sort((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'));

  // Myszką przeciąganie rusza po 8 px. Palcem trzeba kartę przytrzymać, żeby zwykły ruch dalej przewijał listę.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  const [dragged, setDragged] = useState<Task>();

  function handleDragStart(event: DragStartEvent) {
    setDragged(tasks.find((task) => task.id === event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragged(undefined);
    const target = taskStatusSchema.safeParse(event.over?.id);
    const task = tasks.find((item) => item.id === event.active.id);
    if (target.success && task && task.status !== target.data) {
      changeTask.mutate({ id: task.id, change: { status: target.data } });
    }
  }

  const toggleMineOnly = () => {
    setMineOnly(!mineOnly);
    saveMineOnly(!mineOnly);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      // Zakładki są przypięte i zawsze widoczne, a przewijanie w trakcie przesuwałoby dnd-kitowi ich położenie.
      autoScroll={false}
      // dnd-kit domyślnie mierzy zakładki tylko na starcie i potem przesuwa je o przewinięcie strony.
      // Przypięte zakładki się nie przesuwają, więc po przewinięciu w trakcie przeciągania upuszczenie chybiało.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragged(undefined)}
    >
      <div className="flex flex-col gap-4">
        <NewTaskForm user={user} onCreated={() => setActiveStatus('todo')} />

        {/* Zakładki są przypięte u góry, żeby przy długiej liście dało się na nie upuścić kartę. */}
        <div
          role="tablist"
          aria-label="Status zadań"
          className="sticky top-[env(safe-area-inset-top)] z-10 grid grid-cols-3 gap-1 rounded-2xl bg-paper-deep p-1 shadow-[0_8px_10px_-8px_rgb(43_36_32/0.25)]"
        >
          {TASK_STATUSES.map((status) => (
            <StatusTab
              key={status}
              status={status}
              count={tasks.filter((task) => task.status === status).length}
              isActive={status === activeStatus}
              isDropTarget={dragged !== undefined && dragged.status !== status}
              onSelect={() => setActiveStatus(status)}
            />
          ))}
          {/* Podpowiedź wisi pod zakładkami i nie przesuwa listy: wstawiona w układ przewijała stronę w trakcie przeciągania. */}
          {dragged && (
            <p className="pointer-events-none absolute inset-x-0 top-full mt-1 text-center text-sm">
              <span className="rounded-full bg-ink px-3 py-1 font-semibold text-paper shadow-lift">Upuść na zakładce, żeby zmienić status</span>
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-full py-1.5 pr-3.5 pl-2.5 text-sm font-semibold shadow-card transition-colors has-focus-visible:outline-2 has-focus-visible:outline-brand ${
              mineOnly ? 'bg-ink text-paper' : 'bg-card'
            }`}
          >
            <input type="checkbox" checked={mineOnly} onChange={toggleMineOnly} className="peer sr-only" />
            <span
              aria-hidden="true"
              className="flex size-4 items-center justify-center rounded-full border-2 border-current text-[0.6rem] peer-checked:border-sun peer-checked:bg-sun peer-checked:text-ink"
            >
              {mineOnly ? '✓' : ''}
            </span>
            Tylko moje
          </label>
          {/* Archiwum to dalszy ciąg tablicy, więc wchodzi się do niego stąd, a nie z paska nawigacji. */}
          <button
            type="button"
            onClick={onOpenArchive}
            className="flex items-center gap-1.5 rounded-full bg-card py-1.5 pr-3.5 pl-2.5 text-sm font-semibold shadow-card transition-transform active:scale-95 [&>svg]:size-4"
          >
            <ArchiveIcon />
            Archiwum
          </button>
        </div>

        {(tasksQuery.isError || changeTask.isError) && <ErrorNote error={changeTask.error} />}

        {tasksQuery.isPending && <p className="text-ink-muted">Wczytuję zadania…</p>}

        {tasksQuery.isSuccess && visibleTasks.length === 0 && (
          <p className="rounded-2xl border-2 border-dashed border-paper-deep py-10 text-center text-ink-muted">Nic tu jeszcze nie ma.</p>
        )}

        <ul className="flex flex-col gap-2.5">
          {visibleTasks.map((task) => (
            <DraggableTaskItem
              key={task.id}
              task={task}
              user={user}
              family={family}
              today={today}
              onChange={(change) => changeTask.mutate({ id: task.id, change })}
            />
          ))}
        </ul>
      </div>
      <DragOverlay dropAnimation={null}>
        {dragged && (
          <div className="rotate-2 rounded-2xl bg-card p-3 font-bold shadow-lift ring-2 ring-brand">{dragged.title}</div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

type StatusTabProps = {
  status: TaskStatus;
  count: number;
  isActive: boolean;
  isDropTarget: boolean;
  onSelect: () => void;
};

function StatusTab({ status, count, isActive, isDropTarget, onSelect }: StatusTabProps) {
  // Cel jest zawsze włączony, bo dnd-kit mierzy cele na starcie przeciągania. Upuszczenie na obecny status nic nie robi.
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const dropStyle = isDropTarget ? (isOver ? 'ring-2 ring-brand bg-brand-soft scale-105' : 'outline-2 outline-dashed outline-brand/40') : '';

  return (
    <button
      ref={setNodeRef}
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onSelect}
      className={`flex items-center justify-center gap-1 rounded-xl px-1 py-2 text-[0.8125rem] font-bold whitespace-nowrap transition ${
        isActive ? 'bg-card shadow-card' : 'text-ink-muted'
      } ${dropStyle}`}
    >
      {STATUS_LABELS[status]}
      {/* Nazwa zakładki to „Status (liczba)” z widocznego tekstu; nawiasy słychać tylko w czytniku ekranu. */}
      <span className="sr-only"> (</span>
      <span
        className={`min-w-[1.125rem] rounded-full px-1 text-[0.6875rem] leading-[1.125rem] ${isActive ? 'bg-brand text-on-brand' : 'bg-ink/10 text-ink-muted'}`}
      >
        {count}
      </span>
      <span className="sr-only">)</span>
    </button>
  );
}

type DraggableTaskItemProps = {
  task: Task;
  user: User;
  family: FamilyMember[];
  today: string;
  onChange: (change: UpdateTask) => void;
};

/** Karta, którą można przeciągnąć na zakładkę statusu. Przeciągać wolno tylko to, czego status wolno zmienić. */
function DraggableTaskItem(props: DraggableTaskItemProps) {
  const { task, user } = props;
  const canMove = canChangeTask(user, task) || canTakeTask(user, task);
  // Bez atrybutów dnd-kit (role="button"): karta zostaje elementem listy, a z klawiatury działają przyciski.
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: task.id, disabled: !canMove });

  return <TaskItem {...props} drag={canMove ? { ref: setNodeRef, listeners, isDragging } : undefined} />;
}

function NewTaskForm({ user, onCreated }: { user: User; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [dueOn, setDueOn] = useState<string | null>(null);
  const [reward, setReward] = useState<number | null>(null);
  const [color, setColor] = useState<TaskColor | null>(null);
  // Po dodaniu zadania wybór nagrody wraca do „brak”, razem z polem własnej kwoty.
  const [round, setRound] = useState(0);
  const [problem, setProblem] = useState<string>();
  const family = useFamily().data ?? [];
  const hasChildren = useHasChildren();

  const addTask = useCreateTask(() => {
    setTitle('');
    setDueOn(null);
    setReward(null);
    setColor(null);
    setRound((value) => value + 1);
    onCreated();
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const titleError = titleProblem(title);
    if (titleError) return setProblem(titleError);
    // Dziecko nie wybiera osoby: API samo przypisze zadanie do niego.
    // Nagrody też nie ustawia: to decyzja rodzica.
    addTask.mutate(user.role === 'parent' ? { title, assigneeId, dueOn, reward, color } : { title, dueOn, color });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-2xl bg-card p-2.5 shadow-card">
      <div className="flex gap-2">
        <input
          aria-label="Nowe zadanie"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setProblem(undefined);
          }}
          placeholder="Co jest do zrobienia?"
          maxLength={TITLE_MAX_LENGTH}
          aria-invalid={problem !== undefined}
          aria-describedby={problem ? 'new-task-problem' : undefined}
          className="min-w-0 flex-1 rounded-xl border-2 border-transparent bg-paper px-3 py-2.5 text-base font-semibold outline-brand placeholder:font-normal placeholder:text-ink/40 aria-invalid:border-brand"
        />
        <button
          type="submit"
          disabled={addTask.isPending}
          className="rounded-xl bg-brand px-4 py-2.5 font-bold text-on-brand transition-transform active:scale-95 disabled:opacity-60"
        >
          Dodaj
        </button>
      </div>
      {problem && <FieldProblem id="new-task-problem">{problem}</FieldProblem>}
      <div className="flex gap-2">
        {user.role === 'parent' && <AssigneeSelect family={family} value={assigneeId} onChange={setAssigneeId} />}
        <DueInput value={dueOn} onChange={setDueOn} />
      </div>
      {user.role === 'parent' && hasChildren && <RewardPicker key={round} value={reward} onChange={setReward} />}
      <ColorPicker value={color} onChange={setColor} />
      {addTask.isError && <ErrorNote error={addTask.error} />}
    </form>
  );
}
