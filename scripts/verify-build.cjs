const fs = require('node:fs');
const path = require('node:path');

const contentScriptPath = path.join(__dirname, '..', 'dist', 'content.js');
const contentScript = fs.readFileSync(contentScriptPath, 'utf8');

// Manifest-declared content scripts are loaded as classic scripts by Chrome.
// Fail the build if TypeScript configuration changes make this file an ES module.
if (/^\s*(?:import|export)\s/m.test(contentScript)) {
  throw new Error(
    'dist/content.js must be a classic script and cannot contain import/export syntax',
  );
}

console.log('Build verification passed: content.js is a classic script');
