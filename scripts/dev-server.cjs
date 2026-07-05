#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('🔥 Starting development server for Chrome Extension...');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Initial build
console.log('📦 Building extension...');
const buildProcess = spawn(npmCmd, ['run', 'build'], { stdio: 'inherit' });

buildProcess.on('close', (code) => {
  if (code === 0) {
    console.log('✅ Initial build complete!');
    console.log('🔍 Watching for changes...');

    // Start TypeScript watch mode
    const watchProcess = spawn(npmCmd, ['run', 'dev:watch'], { stdio: 'inherit' });

    // Watch for asset changes
    const chokidar = require('chokidar');
    const watcher = chokidar.watch(['public/**/*', 'manifest.json'], {
      ignored: /node_modules/,
      persistent: true,
    });

    watcher.on('change', (filePath) => {
      console.log(`📝 Asset changed: ${filePath}`);
      console.log('🔄 Copying assets...');

      const copyProcess = spawn(npmCmd, ['run', 'copy-assets'], { stdio: 'inherit' });
      copyProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Assets copied successfully!');
        }
      });
    });

    process.on('SIGINT', () => {
      console.log('\n🛑 Stopping development server...');
      watchProcess.kill();
      watcher.close();
      process.exit(0);
    });
  } else {
    console.error('❌ Initial build failed!');
    process.exit(1);
  }
});
