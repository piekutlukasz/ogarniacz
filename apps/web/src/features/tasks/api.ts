import {
  type CreateTask,
  type FamilyMember,
  type Task,
  type Today,
  type UpdateTask,
  familySchema,
  taskListSchema,
  taskSchema,
  todaySchema,
} from '@ogarniacz/shared';
import { useQuery } from '@tanstack/react-query';
import { jsonBody, request } from '../../lib/http';

/** Wspólny początek kluczy: po każdej zmianie zadania odświeżamy tablicę, archiwum i „Dziś” naraz. */
export const TASKS_KEY = ['tasks'];
export const ACTIVE_TASKS_KEY = [...TASKS_KEY, 'active'];
export const ARCHIVED_TASKS_KEY = [...TASKS_KEY, 'archived'];
export const TODAY_KEY = [...TASKS_KEY, 'today'];
export const FAMILY_KEY = ['family'];

export function fetchTasks(): Promise<Task[]> {
  return request(taskListSchema, '/api/tasks');
}

export function fetchArchivedTasks(): Promise<Task[]> {
  return request(taskListSchema, '/api/tasks?archived=true');
}

export function fetchToday(): Promise<Today> {
  return request(todaySchema, '/api/tasks/today');
}

export function fetchFamily(): Promise<FamilyMember[]> {
  return request(familySchema, '/api/users');
}

export function createTask(input: CreateTask): Promise<Task> {
  return request(taskSchema, '/api/tasks', jsonBody('POST', input));
}

export function updateTask(id: string, input: UpdateTask): Promise<Task> {
  return request(taskSchema, `/api/tasks/${id}`, jsonBody('PATCH', input));
}

/** Rodzina zmienia się rzadko, więc nie odświeżamy jej w tle; zmiany kont w ustawieniach odświeżają ją same. */
export function useFamily() {
  return useQuery({ queryKey: FAMILY_KEY, queryFn: fetchFamily, staleTime: 60 * 60 * 1000 });
}

/**
 * Czy w rodzinie jest aktywne konto dziecka. Bez niego kieszonkowe i nagrody nie mają sensu: ekran „Kieszonkowe”,
 * wybór nagrody i plakietki znikają, a nagrody zostają w bazie i wracają z kontem dziecka.
 * Dopóki rodzina się wczytuje, zakładamy, że dziecko jest, żeby ekran nie mrugał w typowej rodzinie.
 */
export function useHasChildren(): boolean {
  const family = useFamily().data;
  return family === undefined || family.some((member) => member.role === 'child');
}
