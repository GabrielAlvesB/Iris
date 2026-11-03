import { spawn } from 'node:child_process';
import type { PacoteLinux } from '../../shared/types/atualizacao.types';

/** Instalar pacotes do Linux pelo pkexec: usado pela atualização do Iris e pelo Workspace. */

/**
 * O comando de baixo nível de cada família — existe em toda distribuição dela
 * e aceita subir, repetir ou voltar de versão (as dependências vieram na
 * primeira instalação): dpkg (Debian, Ubuntu, Mint, Pop!_OS), rpm (Fedora,
 * openSUSE, RHEL e derivados) e pacman (Arch, Manjaro, EndeavourOS).
 */
export const COMANDO_DO_PACOTE: Record<PacoteLinux, (arquivo: string) => string[]> = {
  deb: (arquivo) => ['dpkg', '-i', arquivo],
  rpm: (arquivo) => ['rpm', '-U', '--oldpackage', '--replacepkgs', arquivo],
  pacman: (arquivo) => ['pacman', '-U', '--noconfirm', arquivo],
};

/** O mesmo comando para colar no terminal, quando a janela de senha não deu certo. */
export function comandoParaTerminal(pacote: PacoteLinux, arquivo: string): string {
  return ['sudo', ...COMANDO_DO_PACOTE[pacote](arquivo)].map((p) => (/\s/.test(p) ? `"${p}"` : p)).join(' ');
}

export interface ResultadoPkexec {
  codigo: number | null;
  erro?: NodeJS.ErrnoException;
  saida: string;
}

export function rodarPkexec(args: string[]): Promise<ResultadoPkexec> {
  return new Promise((resolve) => {
    let saida = '';
    try {
      const filho = spawn('pkexec', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      filho.stdout.on('data', (d: Buffer) => (saida += d.toString()));
      filho.stderr.on('data', (d: Buffer) => (saida += d.toString()));
      filho.once('error', (erro: NodeJS.ErrnoException) => resolve({ codigo: null, erro, saida }));
      filho.once('close', (codigo) => resolve({ codigo, saida }));
    } catch (erro) {
      resolve({ codigo: null, erro: erro as NodeJS.ErrnoException, saida });
    }
  });
}

