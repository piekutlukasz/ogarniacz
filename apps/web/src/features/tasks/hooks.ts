import { type Task, type UpdateTask, warsawDate } from '@ogarniacz/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ACTIVE_TASKS_KEY, TASKS_KEY, createTask, updateTask } from './api';

export function useRefreshTasks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: TASKS_KEY });
}

export function useChangeTask() {
  const queryClient = useQueryClient();
  const refresh = useRefreshTasks();
  return useMutation({
    mutationFn: ({ id, change }: { id: string; change: UpdateTask }) => updateTask(id, change),
    // Nowy status widać od razu, np. przeciągnięta karta nie wraca na chwilę na miejsce.
    // Po odpowiedzi serwera lista i tak się odświeża, więc odrzucona zmiana się cofnie.
    onMutate: async ({ id, change }) => {
      if (!change.status) return;
      await queryClient.cancelQueries({ queryKey: ACTIVE_TASKS_KEY });
      queryClient.setQueryData<Task[]>(ACTIVE_TASKS_KEY, (tasks) =>
        tasks?.map((task) => (task.id === id ? { ...task, status: change.status ?? task.status } : task)),
      );
    },
    onSettled: refresh,
  });
}

export function useCreateTask(onCreated: () => void) {
  const refresh = useRefreshTasks();
  return useMutation({
    mutationFn: createTask,
    onSuccess: async () => {
      onCreated();
      await refresh();
    },
  });
}

/** Dzisiejsza data w Polsce według telefonu. „Dziś” bierze datę z serwera, a to służy tylko do etykiet. */
export function localToday(): string {
  return warsawDate(new Date());
}
