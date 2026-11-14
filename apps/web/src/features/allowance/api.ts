import { type Allowance, type MarkPayout, type SetAllowanceRates, allowanceSchema } from '@ogarniacz/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { jsonBody, request } from '../../lib/http';
import { TASKS_KEY } from '../tasks/api';

/** Pod kluczem zadań, bo każda zmiana zadania może zmienić sumę nagród. */
export const ALLOWANCE_KEY = [...TASKS_KEY, 'allowance'];

export function fetchAllowance(): Promise<Allowance> {
  return request(allowanceSchema, '/api/allowance');
}

export function setAllowanceRates(input: SetAllowanceRates): Promise<Allowance> {
  return request(allowanceSchema, '/api/allowance/rates', jsonBody('PUT', input));
}

export function markPayout(input: MarkPayout): Promise<Allowance> {
  return request(allowanceSchema, '/api/allowance/payouts', jsonBody('POST', input));
}

/** Po powrocie do aplikacji w poniedziałek tydzień musi się przeliczyć, więc odświeżamy przy powrocie na ekran. */
export function useAllowance() {
  return useQuery({ queryKey: ALLOWANCE_KEY, queryFn: fetchAllowance, refetchOnWindowFocus: 'always' });
}

/** Obie zmiany zwracają całe kieszonkowe, więc ekran przelicza się bez dodatkowego pobrania. */
function useAllowanceMutation<Input>(mutationFn: (input: Input) => Promise<Allowance>, onDone?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (allowance) => {
      queryClient.setQueryData(ALLOWANCE_KEY, allowance);
      onDone?.();
    },
  });
}

export function useSetAllowanceRates(onDone: () => void) {
  return useAllowanceMutation(setAllowanceRates, onDone);
}

export function useMarkPayout() {
  return useAllowanceMutation(markPayout);
}
