import { OPERATORS } from '../constants/app.ts';

/** Maps a carrier name reported by the phone (e.g. "MTN NG", "Etisalat") to one of OPERATORS, or null. */
export function matchOperator(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = name.toLowerCase();
  const pick = (label: string) => OPERATORS.find((o) => o === label) ?? null;
  if (n.includes('mtn')) return pick('MTN');
  if (n.includes('airtel')) return pick('Airtel');
  if (n.includes('globacom') || /\bglo\b/.test(n)) return pick('Glo');
  if (/9\s?mobile|etisalat|\bt2\b/.test(n)) return pick('9mobile');
  return OPERATORS.find((o) => o.toLowerCase() === n.trim()) ?? null;
}
