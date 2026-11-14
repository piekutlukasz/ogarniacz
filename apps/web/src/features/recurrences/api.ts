import {
  type CreateRecurrence,
  type Recurrence,
  type UpdateRecurrence,
  recurrenceListSchema,
  recurrenceSchema,
} from '@ogarniacz/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { jsonBody, request, requestNoContent } from '../../lib/http';
import { TASKS_KEY } from '../tasks/api';

export const RECURRENCES_KEY = ['recurrences'];

function fetchRecurrences(): Promise<Recurrence[]> {
  return request(recurrenceListSchema, '/api/recurrences');
}

function createRecurrence(input: CreateRecurrence): Promise<Recurrence> {
  return request(recurrenceSchema, '/api/recurrences', jsonBody('POST', input));
}

async function updateRecurrence(id: string, change: UpdateRecurrence): Promise<void> {
  // Usunięcie zwraca 204 bez treści, reszta zmian zwraca regułę, ale i tak odświeżamy listę.
  await requestNoContent(`/api/recurrences/${id}`, jsonBody('PATCH', change));
}

export function useRecurrences() {
  return useQuery({ queryKey: RECURRENCES_KEY, queryFn: fetchRecurrences });
}

/** Zmiana reguły może od razu utworzyć zadanie, więc odświeżamy też tablicę i „Dziś”. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: RECURRENCES_KEY }),
      queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
    ]);
}

export function useCreateRecurrence(onCreated: () => void) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: createRecurrence,
    onSuccess: async () => {
      onCreated();
      await refresh();
    },
  });
}

export function useChangeRecurrence() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, change }: { id: string; change: UpdateRecurrence }) => updateRecurrence(id, change),
    onSettled: refresh,
  });
}
