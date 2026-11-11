import assert from 'node:assert/strict';
import test from 'node:test';
import { compareCase, compareScalar, classifyDifference } from '../src/compare.mjs';
import { validateCases } from '../src/validate.mjs';

const number = value => ({ type: 'number', value });
const text = value => ({ type: 'text', value });
const bool = value => ({ type: 'bool', value });
const error = value => ({ type: 'error', value });
const empty = () => ({ type: 'empty' });

test('compareScalar: default tolerance is 1e-9 absolute or relative', () => {
  assert.equal(compareScalar(number(1), number(1 + 5e-10)), true);
  assert.equal(compareScalar(number(1), number(1 + 2e-8)), false);
  assert.equal(compareScalar(number(0), number(1e-10)), true);
  assert.equal(compareScalar(number(0), number(1e-8)), false);
});

test('compareScalar: case-sensitive text, exact booleans, different error codes', () => {
  assert.equal(compareScalar(text('FF'), text('FF')), true);
  assert.equal(compareScalar(text('FF'), text('ff')), false);
  assert.equal(compareScalar(bool(true), bool(true)), true);
  assert.equal(compareScalar(bool(true), bool(false)), false);
  assert.equal(compareScalar(error('#N/A'), error('#N/A')), true);
  assert.equal(compareScalar(error('#N/A'), error('#VALUE!')), false);
  assert.equal(compareScalar(empty(), empty()), true);
  assert.equal(compareScalar(number(1), text('1')), false);
});

test('classifyDifference: Excel #NAME? is flagged as an environment hint', () => {
  const hint = classifyDifference({}, { status: 'formulaError', value: error('#NAME?') }, { status: 'ok', value: number(1.96) });
  assert.equal(hint.code, 'EXCEL_FUNCTION_UNAVAILABLE');
  assert.equal(hint.attribution, 'environment');
});

test('classifyDifference: numeric gap above 1e-6 is a value diff, below is precision diff', () => {
  assert.equal(classifyDifference({}, { status: 'ok', value: number(1) }, { status: 'ok', value: number(2) }).code, 'VALUE_DIFF');
  const precision = classifyDifference({}, { status: 'ok', value: number(1) }, { status: 'ok', value: number(1 + 1e-8) });
  assert.equal(precision.code, 'PRECISION_DIFF');
});

test('classifyDifference: text vs number is a type diff', () => {
  assert.equal(classifyDifference({}, { status: 'ok', value: text('1') }, { status: 'ok', value: number(1) }).code, 'TYPE_DIFF');
});

test('compareCase: missing input evidence is an execution failure', () => {
  const item = { id: 'T-1', data: [[1]] };
  const excel = { status: 'ok', value: number(1), inputs: [[number(1)]] };
  const spread = { status: 'ok', value: number(1), inputs: [] };
  assert.equal(compareCase(item, excel, spread).outcome, 'EXEC_FAIL');
});

test('compareCase: input snapshot mismatch is an execution failure', () => {
  const item = { id: 'T-1', data: [['2']] };
  const excel = { status: 'ok', value: number(2), inputs: [[text('2')]] };
  const spread = { status: 'ok', value: number(2), inputs: [[number(2)]] };
  assert.equal(compareCase(item, excel, spread).outcome, 'EXEC_FAIL');
});

test('compareCase: expectError mismatch marks the case invalid', () => {
  const item = { id: 'T-1', data: [] };
  const excel = { status: 'ok', value: number(1), inputs: [] };
  const spread = { status: 'ok', value: number(1), inputs: [] };
  assert.equal(compareCase({ ...item, expectError: true }, excel, spread).outcome, 'INVALID');
});

test('compareCase: range values are compared cell by cell', () => {
  const item = { id: 'T-1', data: [], readRange: 'H1:H2' };
  const excel = { status: 'ok', value: number(1), inputs: [], range: [[number(1)], [number(2)]] };
  const spread = { status: 'ok', value: number(1), inputs: [], range: [[number(1)], [number(3)]] };
  const result = compareCase(item, excel, spread);
  assert.equal(result.outcome, 'FAIL');
  assert.equal(result.differences.length, 1);
});

test('validateCases: rejects overlapping data and formula cell', () => {
  const errors = validateCases({ cases: [{ id: 'X-1', category: 'math', function: 'SUM', scenario: 'x', formula: '=SUM(A1:A2)', data: [[1], [2]], formulaCell: 'A1' }] });
  assert.ok(errors.length > 0);
});

test('validateCases: accepts the committed starter corpus', async () => {
  const { readFileSync } = await import('node:fs');
  const document = JSON.parse(readFileSync(new URL('../cases/public/starter.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateCases(document), []);
});
