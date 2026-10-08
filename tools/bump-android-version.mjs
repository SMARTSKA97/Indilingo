#!/usr/bin/env node
// Raises the Android app version. Every release must bump it, or phones will refuse the update.
//   node bump-android-version.mjs patch|minor|major [path/to/version.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function bump(version, kind) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.versionName);
  if (!match) throw new Error(`versionName "${version.versionName}" is not major.minor.patch`);
  let [major, minor, patch] = match.slice(1).map(Number);
  if (kind === 'major') [major, minor, patch] = [major + 1, 0, 0];
  else if (kind === 'minor') [minor, patch] = [minor + 1, 0];
  else if (kind === 'patch') patch += 1;
  else throw new Error(`Unknown bump "${kind}". Use patch, minor or major.`);
  return { versionName: `${major}.${minor}.${patch}`, versionCode: version.versionCode + 1 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [kind = 'patch', file = new URL('../mobile/version.json', import.meta.url).pathname] = process.argv.slice(2);
  const next = bump(JSON.parse(readFileSync(file, 'utf8')), kind);
  writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  console.log(next.versionName);
}
