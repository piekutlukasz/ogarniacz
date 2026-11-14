import {
  type CreateInvite,
  type CreatedInvite,
  type InvitePreview,
  type UpdateAccount,
  type User,
  accountSchema,
  accountsSchema,
  authEventsSchema,
  createdInviteSchema,
  invitePreviewSchema,
  invitesSchema,
  userResponseSchema,
} from '@ogarniacz/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { jsonBody, request, requestNoContent } from '../../lib/http';
import { FAMILY_KEY } from '../tasks/api';

/** Wspólny początek kluczy sekcji „Rodzina”: jedna zmiana odświeża konta, zaproszenia i dziennik naraz. */
export const ACCOUNTS_KEY = ['accounts'];
const INVITES_KEY = [...ACCOUNTS_KEY, 'invites'];
const LIST_KEY = [...ACCOUNTS_KEY, 'list'];
const EVENTS_KEY = [...ACCOUNTS_KEY, 'events'];

/** Fragment adresu z tokenem zaproszenia. Część po `#` nie trafia do serwera, więc token nie ląduje w logach. */
export const INVITE_HASH = 'zaproszenie';

export function inviteLink(token: string): string {
  return `${window.location.origin}/#${INVITE_HASH}=${token}`;
}

/** Token zaproszenia z adresu albo `undefined`. Adres jest od razu sprzątany, żeby token nie został w historii. */
export function takeInviteToken(): string | undefined {
  const prefix = `#${INVITE_HASH}=`;
  const { hash, pathname, search } = window.location;
  if (!hash.startsWith(prefix)) return undefined;
  window.history.replaceState(null, '', `${pathname}${search}`);
  // Uszkodzony link też otwiera ekran zaproszenia, a serwer odpowie, że zaproszenie jest nieważne.
  return hash.slice(prefix.length).slice(0, 200) || '-';
}

/** Wszystko tylko dla rodzica: dziecku API odpowiada 403, więc nie pytamy. */
export function useAccounts(enabled: boolean) {
  return useQuery({ queryKey: LIST_KEY, queryFn: () => request(accountsSchema, '/api/users/accounts'), enabled });
}

export function useInvites(enabled: boolean) {
  return useQuery({ queryKey: INVITES_KEY, queryFn: () => request(invitesSchema, '/api/invites'), enabled });
}

export function useAuthEvents(enabled: boolean) {
  return useQuery({ queryKey: EVENTS_KEY, queryFn: () => request(authEventsSchema, '/api/auth/events'), enabled });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
      // Wyłączone konto znika z wyboru osoby przy zadaniach.
      queryClient.invalidateQueries({ queryKey: FAMILY_KEY }),
    ]);
}

export function useCreateInvite() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: CreateInvite): Promise<CreatedInvite> => request(createdInviteSchema, '/api/invites', jsonBody('POST', input)),
    onSettled: refresh,
  });
}

export function useRevokeInvite() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => requestNoContent(`/api/invites/${id}`, { method: 'DELETE' }),
    onSettled: refresh,
  });
}

export function useUpdateAccount() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, ...change }: UpdateAccount & { id: string }) => request(accountSchema, `/api/users/${id}`, jsonBody('PATCH', change)),
    onSettled: refresh,
  });
}

export function previewInvite(token: string): Promise<InvitePreview> {
  return request(invitePreviewSchema, '/api/invites/preview', jsonBody('POST', { token }));
}

export async function acceptInvite(input: { token: string; password: string }): Promise<User> {
  return (await request(userResponseSchema, '/api/invites/accept', jsonBody('POST', input))).user;
}
