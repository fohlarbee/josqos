import * as Cellular from 'expo-cellular';
import { PermissionsAndroid, Platform } from 'react-native';

import RadioNative from '../../modules/josqos-radio/src/JosqosRadioModule';
import type { RadioInfo } from '@/types';

let askedForPhoneState = false;

/** Android 11 and below need READ_PHONE_STATE to read the network type; Android 12+ needs nothing. */
async function askPhoneStateOnce() {
  if (askedForPhoneState || Platform.OS !== 'android' || Number(Platform.Version) >= 31) return;
  askedForPhoneState = true;
  try {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE);
  } catch {
    // Denied or unavailable: the native module then reports less, it does not fail.
  }
}

/**
 * What the phone says about its mobile-data connection.
 * Android build: the native JosqosRadio module (real network type, NSA 5G, RSRP, data SIM's operator).
 * Expo Go / iOS: only the generation and carrier from expo-cellular, marked not reliable.
 */
export async function getRadioInfo(): Promise<RadioInfo> {
  if (RadioNative) {
    try {
      await askPhoneStateOnce();
      const r = await RadioNative.getRadioInfo();
      return {
        technology: r.technology,
        operator: r.operator,
        signalDbm: r.signalDbm,
        networkType: r.nsa ? 'LTE + NR (5G NSA)' : r.networkType,
        reliable: r.reliable,
        details: `Android ${r.sdk} · LTE ${r.lteRsrp ?? '—'} dBm / ${r.lteSinr ?? '—'} dB · NR ${r.nrRsrp ?? '—'} dBm / ${r.nrSinr ?? '—'} dB`,
        source: 'native',
      };
    } catch {
      // Fall through to the generic path below.
    }
  }

  try {
    const [gen, operator] = await Promise.all([
      Cellular.getCellularGenerationAsync(),
      Cellular.getCarrierNameAsync(),
    ]);
    const technology =
      gen === Cellular.CellularGeneration.CELLULAR_5G
        ? '5G'
        : gen === Cellular.CellularGeneration.CELLULAR_4G
          ? '4G'
          : null;
    return { technology, operator, signalDbm: null, networkType: null, reliable: false, details: null, source: 'expo-cellular' };
  } catch {
    return { technology: null, operator: null, signalDbm: null, networkType: null, reliable: false, details: null, source: 'expo-cellular' };
  }
}
