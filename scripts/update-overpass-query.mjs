import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const canalsPath = resolve(projectRoot, process.argv[2] ?? 'public/canals.txt');
const queryPath = resolve(projectRoot, process.argv[3] ?? 'public/query.overpass');

function escapeRegexLiteral(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&').replace(/"/g, '\\"');
}

function readCanalNames(path) {
  const seen = new Set();

  return readFileSync(path, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .filter((line) => {
      if (seen.has(line)) {
        return false;
      }

      seen.add(line);
      return true;
    });
}

const canals = readCanalNames(canalsPath);

if (canals.length === 0) {
  console.error(`No canal names found in ${canalsPath}.`);
  process.exit(1);
}

const nameRegex = `^(${canals.map(escapeRegexLiteral).join('|')})$`;
const nameFilter = `  ["name"~"${nameRegex}"]`;
const query = readFileSync(queryPath, 'utf8');
const updatedQuery = query.replace(/^\s*\["name"~"[^"]*"\]\s*$/m, nameFilter);

if (updatedQuery === query) {
  console.error(`Could not find an existing name regex filter in ${queryPath}.`);
  process.exit(1);
}

writeFileSync(queryPath, updatedQuery);

console.log(`Updated ${queryPath} with ${canals.length} canal name${canals.length === 1 ? '' : 's'}.`);
