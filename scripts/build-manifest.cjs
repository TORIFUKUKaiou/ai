// CJS wrapper to build dist/manifest.json (compatible when package "type": "module")
const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const srcManifestPath = path.join(projectRoot, 'manifest.json');
const distDir = path.join(projectRoot, 'dist');
const distManifestPath = path.join(distDir, 'manifest.json');

function ensureDist() {
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
}

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeJSON(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function transformManifest(manifest) {
  const out = { ...manifest };
  if (out.action && out.action.default_popup) {
    out.action = { ...out.action, default_popup: out.action.default_popup.replace(/\.ts$/, '.js') };
  }
  if (out.background && out.background.service_worker) {
    out.background = {
      ...out.background,
      service_worker: out.background.service_worker.replace(/\.ts$/, '.js'),
      type: 'module',
    };
  }
  if (Array.isArray(out.content_scripts)) {
    out.content_scripts = out.content_scripts.map((cs) => {
      const next = { ...cs };
      if (Array.isArray(next.js)) {
        next.js = next.js.map((file) => file.replace(/\.ts$/, '.js'));
      }
      return next;
    });
  }
  return out;
}

function main() {
  ensureDist();
  const manifest = readJSON(srcManifestPath);
  const transformed = transformManifest(manifest);
  writeJSON(distManifestPath, transformed);
  console.log('Wrote', path.relative(projectRoot, distManifestPath));
}

main();
