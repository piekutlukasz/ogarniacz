import { type ChangePassword, logoutOthersResponseSchema } from '@ogarniacz/shared';
import { useMutation } from '@tanstack/react-query';
import { jsonBody, request, requestNoContent } from '../../lib/http';

/** Zmiana własnego hasła; serwer wylogowuje przy tym pozostałe urządzenia. */
export function useChangePassword() {
  return useMutation({
    mutationFn: (change: ChangePassword) => requestNoContent('/api/auth/password', jsonBody('POST', change)),
  });
}

/** Wylogowanie osoby na pozostałych urządzeniach; zwraca, ile ich było. */
export function useLogoutOthers() {
  return useMutation({
    mutationFn: async () => (await request(logoutOthersResponseSchema, '/api/auth/logout-all', { method: 'POST' })).count,
  });
}
