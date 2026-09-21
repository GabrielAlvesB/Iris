import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export function getDataDir(): string {
  const dir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDataFilePath(fileName: string): string {
  return path.join(getDataDir(), fileName);
}

