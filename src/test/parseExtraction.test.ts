import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExtractionResponse } from '../ai/parse';
import { AIProviderError } from '../ai/types';

test('parses well-formed JSON', () => {
  const out = parseExtractionResponse(
    '{"goal":"refresh tokens","decisions":["use rotation"],"assumptions":["backend returns 401"],"pending":["error handling"]}'
  );
  assert.equal(out.goal, 'refresh tokens');
  assert.deepEqual(out.decisions, ['use rotation']);
  assert.deepEqual(out.assumptions, ['backend returns 401']);
  assert.deepEqual(out.pending, ['error handling']);
});

test('strips ```json fences when models wrap output', () => {
  const out = parseExtractionResponse(
    '```json\n{"goal":"x","decisions":[],"assumptions":[],"pending":[]}\n```'
  );
  assert.equal(out.goal, 'x');
});

test('recovers JSON when surrounded by extra prose', () => {
  const out = parseExtractionResponse(
    'Here you go:\n{"goal":"y","decisions":["a"],"assumptions":[],"pending":[]}\nHope that helps.'
  );
  assert.equal(out.goal, 'y');
  assert.deepEqual(out.decisions, ['a']);
});

test('coerces missing array fields to empty arrays', () => {
  const out = parseExtractionResponse('{"goal":""}');
  assert.equal(out.goal, undefined);
  assert.deepEqual(out.decisions, []);
  assert.deepEqual(out.assumptions, []);
  assert.deepEqual(out.pending, []);
});

test('drops non-string entries from lists', () => {
  const out = parseExtractionResponse(
    '{"goal":"","decisions":["valid",42,null,"another"],"assumptions":[],"pending":[]}'
  );
  assert.deepEqual(out.decisions, ['valid', 'another']);
});

test('truncates oversized items and caps list length at 10', () => {
  const long = 'x'.repeat(500);
  const arr = Array.from({ length: 20 }, () => long);
  const out = parseExtractionResponse(
    JSON.stringify({ goal: '', decisions: arr, assumptions: [], pending: [] })
  );
  assert.equal(out.decisions.length, 10);
  assert.ok(out.decisions[0].length <= 200);
  assert.match(out.decisions[0], /…$/);
});

test('throws AIProviderError on invalid JSON', () => {
  assert.throws(() => parseExtractionResponse('not json at all'), (err) => err instanceof AIProviderError);
});

test('throws on JSON arrays at the root', () => {
  assert.throws(
    () => parseExtractionResponse('[1, 2, 3]'),
    (err) => err instanceof AIProviderError
  );
});

test('throws on empty input', () => {
  assert.throws(() => parseExtractionResponse('   '), (err) => err instanceof AIProviderError);
});
