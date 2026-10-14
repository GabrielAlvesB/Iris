/**
 * Backup automático: um backup completo (o mesmo `ExportBundle` do "Exportar
 * tudo") gravado de tempos em tempos numa pasta que o usuário escolhe, com as
 * últimas N versões.
 *
 * A configuração mora em backup-auto.json, fora do bundle de propósito: a pasta
 * é deste computador, e restaurar um backup não pode trocar o destino dos
 * próximos backups.
 */

export const INTERVALOS_BACKUP = [
  { horas: 6, rotulo: 'A cada 6 horas' },
  { horas: 12, rotulo: 'A cada 12 horas' },
  { horas: 24, rotulo: 'Uma vez por dia' },
  { horas: 168, rotulo: 'Uma vez por semana' },
] as const;

export const INTERVALO_BACKUP_PADRAO = 24;
export const MANTER_BACKUPS_PADRAO = 7;
export const MANTER_BACKUPS_MIN = 1;
export const MANTER_BACKUPS_MAX = 60;

/** Prefixo dos arquivos gerados: a poda só apaga o que começa com ele. */
export const PREFIXO_BACKUP_AUTO = 'Iris-backup-';

export interface BackupAutoFile {
  schemaVersion: number;
  ativo: boolean;
  /** Caminho canônico (realpath) escolhido no diálogo do main. Vazio = ainda não escolhida. */
  pasta: string;
  intervaloHoras: number;
  manter: number;
  /** ISO do último backup que deu certo. */
  ultimoEm: string;
  /** Mensagem da última tentativa que falhou; vazia depois de um backup bem-sucedido. */
  ultimoErro: string;
}

/** O que a tela recebe: a configuração e o que se sabe da pasta agora. */
export interface EstadoBackupAuto {
  ativo: boolean;
  pasta: string;
  pastaExiste: boolean;
  intervaloHoras: number;
  manter: number;
  ultimoEm: string;
  ultimoErro: string;
  /** ISO de quando o próximo deve sair; vazio com o backup desligado ou sem pasta. */
  proximoEm: string;
  fazendo: boolean;
}

export interface MudancaBackupAuto {
  ativo?: boolean;
  intervaloHoras?: number;
  manter?: number;
}

export interface BackupNaPasta {
  /** Só o nome: a tela devolve ele para restaurar, nunca um caminho. */
  arquivo: string;
  criadoEm: string;
  tamanho: number;
}
