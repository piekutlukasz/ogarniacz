import { type FamilyMember, type UpdateMe, familyMemberSchema } from '@ogarniacz/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { jsonBody, request } from '../../lib/http';
import { FAMILY_KEY } from '../tasks/api';

export function updateMe(change: UpdateMe): Promise<FamilyMember> {
  return request(familyMemberSchema, '/api/users/me', jsonBody('PATCH', change));
}

/** Zmiana własnego koloru. Od razu podmienia osobę na liście rodziny, żeby karty przemalowały się bez czekania. */
export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMe,
    onSuccess: (member) => {
      queryClient.setQueryData<FamilyMember[]>(FAMILY_KEY, (family) =>
        family?.map((item) => (item.id === member.id ? member : item)),
      );
    },
  });
}
