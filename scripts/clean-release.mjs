import { rmSync } from 'node:fs';

// electron-builder não apaga o que gerou antes: sem isto, instaladores e .zip
// de versões antigas se acumulam em release/ ao lado do atual. As versões
// publicadas ficam guardadas nas Releases do GitHub.
rmSync(new URL('../release', import.meta.url), { recursive: true, force: true });
