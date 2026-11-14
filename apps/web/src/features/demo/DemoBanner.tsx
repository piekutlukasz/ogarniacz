import { useQuery } from '@tanstack/react-query';
import { DEMO_KEY, fetchDemoInfo } from './api';

/** Pasek na górze demo. Na zwykłym serwerze nic nie rysuje. */
export function DemoBanner() {
  const demo = useQuery({ queryKey: DEMO_KEY, queryFn: fetchDemoInfo, staleTime: Number.POSITIVE_INFINITY, retry: false });
  if (!demo.data) return null;
  return (
    <p role="note" className="mb-4 rounded-xl bg-brand/15 px-3 py-2 text-center text-sm font-semibold">
      Wersja demonstracyjna: dane przykładowe, wracają do stanu początkowego co godzinę.
    </p>
  );
}
