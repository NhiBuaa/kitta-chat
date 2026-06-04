import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  clearCallStorage,
  getStoredCallAnsweredAt,
  persistCallAnsweredAt,
} from './callStorage.js';

const storage = new Map();

globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

beforeEach(() => {
  storage.clear();
});

test('persistCallAnsweredAt stores valid canonical answeredAt', () => {
  persistCallAnsweredAt('2026-01-01T08:00:00.000Z');

  assert.equal(getStoredCallAnsweredAt(), '2026-01-01T08:00:00.000Z');
});

test('getStoredCallAnsweredAt ignores missing or invalid values', () => {
  assert.equal(getStoredCallAnsweredAt(), null);

  localStorage.setItem('callAnsweredAt', 'not-a-date');

  assert.equal(getStoredCallAnsweredAt(), null);
});

test('clearCallStorage clears stored answeredAt', () => {
  persistCallAnsweredAt('2026-01-01T08:00:00.000Z');

  clearCallStorage();

  assert.equal(getStoredCallAnsweredAt(), null);
});