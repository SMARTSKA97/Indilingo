import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bump } from './bump-android-version.mjs';

test('patch raises the last number and the build code', () => {
  assert.deepEqual(bump({ versionName: '1.2.3', versionCode: 7 }, 'patch'), { versionName: '1.2.4', versionCode: 8 });
});

test('minor resets patch', () => {
  assert.deepEqual(bump({ versionName: '1.2.3', versionCode: 7 }, 'minor'), { versionName: '1.3.0', versionCode: 8 });
});

test('major resets minor and patch', () => {
  assert.deepEqual(bump({ versionName: '1.2.3', versionCode: 7 }, 'major'), { versionName: '2.0.0', versionCode: 8 });
});

test('rejects an unknown kind and a malformed version', () => {
  assert.throws(() => bump({ versionName: '1.0.0', versionCode: 1 }, 'huge'));
  assert.throws(() => bump({ versionName: '1.0', versionCode: 1 }, 'patch'));
});
