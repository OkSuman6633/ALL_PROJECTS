import assert from 'node:assert/strict';
import test from 'node:test';
import { canAlignCurrency } from './diagnosticWorkflow.ts';

test('currency alignment is offered only for a single three-character currency code', () => {
  assert.equal(canAlignCurrency('GBP'), true);
  assert.equal(canAlignCurrency('MIXED'), false);
  assert.equal(canAlignCurrency(undefined), false);
});
