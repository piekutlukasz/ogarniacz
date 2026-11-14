import { encode } from 'uqr';
import { useMemo } from 'react';

/**
 * Kod QR rysowany w przeglądarce rodzica. Token zaproszenia nie może trafić do zewnętrznej usługi z obrazkami,
 * a CSP i tak by jej nie wpuścił. Kolory `qr-dark` i `qr-light` są takie same w każdym motywie.
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const path = useMemo(() => {
    const { data } = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { d, size: data.length };
  }, [value]);

  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${path.size} ${path.size}`} shapeRendering="crispEdges" className="aspect-square w-full max-w-60 rounded-xl">
      <rect width={path.size} height={path.size} className="fill-qr-light" />
      <path d={path.d} className="fill-qr-dark" />
    </svg>
  );
}
