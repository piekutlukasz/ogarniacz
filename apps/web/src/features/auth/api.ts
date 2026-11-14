import { type LoginRequest, type User, userResponseSchema, userSchema } from '@ogarniacz/shared';
import { ApiError, UnauthorizedError, jsonBody, request, requestNoContent } from '../../lib/http';

export const ME_KEY = ['me'];

const ME_STORAGE = 'ogarniacz.me';

/** Ostatnio zalogowana osoba zapisana na telefonie, żeby aplikacja otworzyła się bez sieci, np. w sklepie. */
function readCachedMe(): User | undefined {
  try {
    const saved = localStorage.getItem(ME_STORAGE);
    return saved ? userSchema.parse(JSON.parse(saved)) : undefined;
  } catch {
    return undefined;
  }
}

export function cacheMe(user: User | null) {
  try {
    if (user) localStorage.setItem(ME_STORAGE, JSON.stringify(user));
    else localStorage.removeItem(ME_STORAGE);
  } catch {
    // Bez zapisu aplikacja po prostu nie otworzy się bez sieci.
  }
}

/**
 * Zalogowany użytkownik albo `null`, gdy nie ma sesji. Bez sieci: osoba zapamiętana na telefonie.
 * Sesję i tak sprawdzi serwer przy pierwszym żądaniu po powrocie sieci.
 */
export async function fetchMe(): Promise<User | null> {
  try {
    const { user } = await request(userResponseSchema, '/api/auth/me');
    cacheMe(user);
    return user;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      cacheMe(null);
      return null;
    }
    const cached = error instanceof ApiError ? undefined : readCachedMe();
    if (cached) return cached;
    throw error;
  }
}

export async function logIn(input: LoginRequest): Promise<User> {
  try {
    return (await request(userResponseSchema, '/api/auth/login', jsonBody('POST', input))).user;
  } catch (error) {
    // Przy logowaniu 401 oznacza złe dane, a nie wygasłą sesję.
    if (error instanceof UnauthorizedError) throw new ApiError('Nieprawidłowy login lub hasło', 401);
    throw error;
  }
}

export function logOut(): Promise<void> {
  return requestNoContent('/api/auth/logout', { method: 'POST' });
}
