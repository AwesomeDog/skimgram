// Tags a release: bumps package.json (the single source of both the userscript's
// @version and the extension manifest), commits and tags. Pushing is left to you, so
// nothing leaves the machine before you have looked at it. Usage: npm run bump -- minor

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const part = process.argv[2] ?? 'patch';
if (!/^(patch|minor|major|\d+\.\d+\.\d+)$/.test(part)) {
  console.error('usage: npm run bump -- patch|minor|major|x.y.z');
  process.exit(1);
}
if (execSync('git status --porcelain').toString().trim()) {
  console.error('working tree is dirty; commit or stash first');
  process.exit(1);
}

execSync(`npm version ${part} -m 'v%s'`, { stdio: 'inherit' });

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
console.log(`\nv${version} committed and tagged. To release it:`);
console.log('  git push --follow-tags');
