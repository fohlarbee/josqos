import type { RadioInfo, Technology } from '../types.ts';

/**
 * Returns a message when the phone's real connection contradicts the technology the researcher
 * selected (so a 4G run can never be saved as 5G), or null when the run may go ahead.
 * Only enforced when the phone's answer is reliable; iOS and old Android never block.
 */
export function technologyMismatch(
  live: Pick<RadioInfo, 'technology' | 'reliable' | 'networkType' | 'source'>,
  selected: Technology,
): string | null {
  if (live.source !== 'native' || !live.reliable) return null;
  if (live.technology === selected) return null;
  if (live.technology === null) {
    return `The phone is on ${live.networkType ?? 'an unknown network'}, not 4G or 5G. Check the network mode and mobile data.`;
  }
  return `The phone is on ${live.technology} but ${selected} is selected. Change the selection, or the phone's network mode.`;
}
