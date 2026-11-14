import { type SetupRequest, type User, setupStatusSchema, userResponseSchema } from '@ogarniacz/shared';
import { ApiError, jsonBody, request } from '../../lib/http';

export const SETUP_KEY = ['setup'];

/**
 * Czy serwer czeka na kreator pierwszego uruchomienia (baza bez kont). Zwykły serwer odpowiada 404, a bez sieci
 * też pokazujemy logowanie: kreator jest tylko dla świeżej instalacji, która i tak musi mieć połączenie.
 */
export async function fetchSetupNeeded(): Promise<boolean> {
  try {
    return (await request(setupStatusSchema, '/api/setup')).needed;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return false;
    if (error instanceof ApiError) throw error;
    return false;
  }
}

export async function completeSetup(input: SetupRequest): Promise<User> {
  return (await request(userResponseSchema, '/api/setup', jsonBody('POST', input))).user;
}
