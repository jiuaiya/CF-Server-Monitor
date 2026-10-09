#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');

console.log('Cleaning dist directory...');
if (fs.existsSync(distDir)) {
  fs.removeSync(distDir);
}

console.log('Building frontend...');
execSync('npx vite build', { cwd: rootDir, stdio: 'inherit' });

console.log('Copying static assets...');
if (fs.existsSync(publicDir)) {
  fs.copySync(publicDir, distDir, { overwrite: false });
  console.log('Copied all static assets');
}

// 重命名为 dashboard.html，避免 ASSETS 直接拦截首页
const indexHtmlPath = path.join(distDir, 'index.html');
const dashboardHtmlPath = path.join(distDir, 'dashboard.html');
if (fs.existsSync(indexHtmlPath)) {
  fs.renameSync(indexHtmlPath, dashboardHtmlPath);
  console.log('Renamed index.html → dashboard.html');
}

console.log('Build complete!');

console.log('Building bundled SAO theme...');
execSync('npm run build --workspace cfsm-theme-sao', {
  cwd: rootDir,
  stdio: 'inherit',
  env: { ...process.env, CFSM_BUNDLED_BUILD: '1' }
});
fs.moveSync(path.join(distDir, 'builtin/sao/index.html'), path.join(distDir, 'sao.html'), { overwrite: true });
fs.copySync(path.join(rootDir, 'themes/sao/LICENSE'), path.join(distDir, 'builtin/sao/LICENSE.txt'));
console.log('Bundled SAO theme ready.');
