type Parser<T> = { parse: (data: unknown) => T };

/** Sesja wygasła albo użytkownik się nie zalogował. Aplikacja pokazuje wtedy ekran logowania. */
export class UnauthorizedError extends Error {
  constructor() {
    super('Zaloguj się');
  }
}

/** Błąd z komunikatem z serwera, gotowym do pokazania użytkownikowi. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, { credentials: 'same-origin', ...init });
  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: unknown };
    const message = typeof body.error === 'string' ? body.error : `Serwer odpowiedział kodem ${response.status}`;
    throw new ApiError(message, response.status);
  }
  return response;
}

export async function request<T>(parser: Parser<T>, path: string, init?: RequestInit): Promise<T> {
  const response = await send(path, init);
  return parser.parse(await response.json());
}

export async function requestNoContent(path: string, init?: RequestInit): Promise<void> {
  await send(path, init);
}

export function jsonBody(method: 'POST' | 'PATCH' | 'PUT', body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
