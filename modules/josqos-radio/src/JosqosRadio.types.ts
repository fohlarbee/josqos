/** What the phone reports about its mobile-data connection. Mirrors RadioSnapshot in JosqosRadioModule.kt. */
export type RadioSnapshot = {
  /** '4G', '5G', or null when the phone is not on 4G/5G (or cannot tell). */
  technology: '4G' | '5G' | null;
  /** False when `technology` is a best guess (Android 11 and below cannot see 5G NSA). */
  reliable: boolean;
  /** LTE, NR, 3G, 2G, UNKNOWN or OTHER. */
  networkType: string;
  /** 5G non-standalone: an LTE anchor plus an NR carrier. */
  nsa: boolean;
  operator: string | null;
  /** RSRP in dBm of the serving technology (NR for 5G, LTE for 4G). */
  signalDbm: number | null;
  lteRsrp: number | null;
  lteSinr: number | null;
  nrRsrp: number | null;
  nrSinr: number | null;
  sdk: number;
};
