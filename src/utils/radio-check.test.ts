import assert from 'node:assert/strict';
import { test } from 'node:test';

import { technologyMismatch } from './radio-check.ts';

const native = { source: 'native', reliable: true, networkType: 'LTE' } as const;

test('matching technology may proceed', () => {
  assert.equal(technologyMismatch({ ...native, technology: '4G' }, '4G'), null);
  assert.equal(technologyMismatch({ ...native, technology: '5G', networkType: 'NR' }, '5G'), null);
});

test('a 4G phone cannot be saved as 5G, and vice versa', () => {
  assert.match(technologyMismatch({ ...native, technology: '4G' }, '5G')!, /phone is on 4G but 5G is selected/);
  assert.match(technologyMismatch({ ...native, technology: '5G' }, '4G')!, /phone is on 5G but 4G is selected/);
});

test('a phone on 3G or 2G is refused with the network type in the message', () => {
  const msg = technologyMismatch({ ...native, technology: null, networkType: '3G' }, '4G')!;
  assert.match(msg, /3G, not 4G or 5G/);
});

test('never blocks when the phone cannot be trusted (old Android, iOS, best guess)', () => {
  assert.equal(technologyMismatch({ ...native, reliable: false, technology: '4G' }, '5G'), null);
  assert.equal(technologyMismatch({ source: 'expo-cellular', reliable: true, networkType: null, technology: '4G' }, '5G'), null);
  assert.equal(technologyMismatch({ ...native, reliable: false, technology: null }, '5G'), null);
});
