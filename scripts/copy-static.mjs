import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(scriptsDir, '..');
const rendererOut = path.join(projectRoot, 'dist', 'renderer');
const vendorOut = path.join(rendererOut, 'vendor', 'sortablejs');

mkdirSync(rendererOut, { recursive: true });
mkdirSync(vendorOut, { recursive: true });

cpSync(path.join(projectRoot, 'src', 'renderer', 'index.html'), path.join(rendererOut, 'index.html'));
cpSync(path.join(projectRoot, 'src', 'renderer', 'styles'), path.join(rendererOut, 'styles'), { recursive: true });
cpSync(path.join(projectRoot, 'src', 'renderer', 'assets'), path.join(rendererOut, 'assets'), { recursive: true });
cpSync(path.join(projectRoot, 'src', 'renderer', 'vendor', 'fonts'), path.join(rendererOut, 'vendor', 'fonts'), {
  recursive: true,
});

const mainAssetsOut = path.join(projectRoot, 'dist', 'main', 'assets');
mkdirSync(mainAssetsOut, { recursive: true });
cpSync(path.join(projectRoot, 'src', 'main', 'assets'), mainAssetsOut, { recursive: true });
cpSync(
  path.join(projectRoot, 'node_modules', 'sortablejs', 'Sortable.min.js'),
  path.join(vendorOut, 'Sortable.min.js'),
);
