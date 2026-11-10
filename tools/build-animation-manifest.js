const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const actionsDir = path.join(root, 'public', 'images', 'actions');
const output = path.join(root, 'tools', 'animations.json');

const files = fs.readdirSync(actionsDir)
  .filter(file => /\.(png|webp|jpg|jpeg)$/i.test(file))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const groups = new Map();
for (const file of files) {
  const base = path.basename(file, path.extname(file));
  const key = base.replace(/[_-]?\d+$/, '') || base;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(file);
}

const manifest = [...groups.entries()].map(([name, frames]) => ({ name, frames }));
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${manifest.length} animation groups and ${files.length} frames to ${output}`);
