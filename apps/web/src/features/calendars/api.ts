import {
  type Calendar,
  type CreateCalendar,
  type EventsResponse,
  type UpdateCalendar,
  calendarListSchema,
  calendarSchema,
  eventsResponseSchema,
} from '@ogarniacz/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { jsonBody, request, requestNoContent } from '../../lib/http';

export const CALENDARS_KEY = ['calendars'];
/** Wspólny początek kluczy wydarzeń, żeby jedna zmiana kalendarza odświeżała „Dziś” i listę. */
export const EVENTS_KEY = ['events'];

function fetchEvents(): Promise<EventsResponse> {
  return request(eventsResponseSchema, '/api/events');
}

/** Wydarzenia na dziś dla zalogowanej osoby. Po powrocie do aplikacji następnego dnia lista się przelicza. */
export function useTodayEvents() {
  return useQuery({ queryKey: [...EVENTS_KEY, 'today'], queryFn: fetchEvents, refetchOnWindowFocus: 'always' });
}

/** Lista kalendarzy do zarządzania. Tylko rodzic: dla dziecka API odpowiada 403, więc nie pytamy. */
export function useCalendars(enabled: boolean) {
  return useQuery({
    queryKey: CALENDARS_KEY,
    queryFn: () => request(calendarListSchema, '/api/calendars'),
    enabled,
  });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: CALENDARS_KEY }),
      queryClient.invalidateQueries({ queryKey: EVENTS_KEY }),
    ]);
}

export function useAddCalendar(onAdded: (calendar: Calendar) => void) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: CreateCalendar) => request(calendarSchema, '/api/calendars', jsonBody('POST', input)),
    onSuccess: async (calendar) => {
      onAdded(calendar);
      await refresh();
    },
  });
}

export function useChangeCalendar(onChanged?: () => void) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, change }: { id: string; change: UpdateCalendar }) =>
      // Odpięcie zwraca 204, zmiana zwraca kalendarz; i tak odświeżamy listę.
      requestNoContent(`/api/calendars/${id}`, jsonBody('PATCH', change)),
    onSuccess: () => onChanged?.(),
    onSettled: refresh,
  });
}

export function useSyncCalendar() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => request(calendarSchema, `/api/calendars/${id}/sync`, { method: 'POST' }),
    onSettled: refresh,
  });
}
