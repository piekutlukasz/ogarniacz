import { type DemoInfo, type User, demoInfoSchema, userResponseSchema } from '@ogarniacz/shared';
import { useQuery } from '@tanstack/react-query';
import { ApiError, jsonBody, request } from '../../lib/http';

export const DEMO_KEY = ['demo'];

/** Informacje o trybie demo albo `null` na zwykłym serwerze, który odpowiada 404. */
export async function fetchDemoInfo(): Promise<DemoInfo | null> {
  try {
    return await request(demoInfoSchema, '/api/demo');
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Tryb demo: dane `DemoInfo`, a na zwykłym serwerze `null`. Pytamy raz na uruchomienie aplikacji. */
export function useDemoInfo() {
  return useQuery({ queryKey: DEMO_KEY, queryFn: fetchDemoInfo, staleTime: Number.POSITIVE_INFINITY, retry: false });
}

export async function demoLogIn(login: string): Promise<User> {
  return (await request(userResponseSchema, '/api/demo/login', jsonBody('POST', { login }))).user;
}
