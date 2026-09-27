/** Study locations (Chapter 1.8 / 3.4). Edit this list to change the picker. */
export const LOCATIONS = ['University of Jos', 'Terminus', 'Rayfield', 'Tudun Wada'];

/** Network providers offered in the Measure tab (the four most used in Nigeria). */
export const OPERATORS = ['MTN', 'Airtel', 'Glo', '9mobile'];

/**
 * Test server. Cloudflare's public speed-test endpoints; a request from a Nigerian IP was served
 * from Amsterdam, so latency includes that path. Swap these two to use a nearer server.
 */
export const SERVER = {
  down: (bytes: number) => `https://speed.cloudflare.com/__down?bytes=${bytes}`,
  up: 'https://speed.cloudflare.com/__up',
};

export const TEST = {
  /** Probes per run; a separate warm-up probe is sent first and discarded. */
  latencyProbes: 20,
  probeTimeoutMs: 3000,
  /** Stop probing after this long once `minLatencySamples` are in, so a slow link cannot stretch a run. */
  latencyBudgetMs: 8000,
  minLatencySamples: 5,
  /** Sizes are tried in order; a bigger one is only used if the last finished within `escalateBelowMs`. */
  downloadSizes: [1_000_000, 10_000_000, 50_000_000],
  uploadSizes: [1_000_000, 5_000_000, 25_000_000],
  escalateBelowMs: 2000,
  transferTimeoutMs: 30_000,
  maxRuns: 5,
};

export const ALPHA = 0.05;
