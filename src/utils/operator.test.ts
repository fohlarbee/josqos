import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchOperator } from './operator.ts';

test('matchOperator recognises the four Nigerian operators by common carrier strings', () => {
  assert.equal(matchOperator('MTN NG'), 'MTN');
  assert.equal(matchOperator('mtn'), 'MTN');
  assert.equal(matchOperator('Airtel'), 'Airtel');
  assert.equal(matchOperator('Airtel NG'), 'Airtel');
  assert.equal(matchOperator('Glo'), 'Glo');
  assert.equal(matchOperator('Globacom'), 'Glo');
  assert.equal(matchOperator('9mobile'), '9mobile');
  assert.equal(matchOperator('9 Mobile'), '9mobile');
  assert.equal(matchOperator('Etisalat'), '9mobile');
});

test('matchOperator returns null for unknown, empty or missing names', () => {
  assert.equal(matchOperator('Vodafone'), null);
  assert.equal(matchOperator('Global Telecom'), null); // "glo" inside a longer word is not Glo
  assert.equal(matchOperator(''), null);
  assert.equal(matchOperator(null), null);
  assert.equal(matchOperator(undefined), null);
});
