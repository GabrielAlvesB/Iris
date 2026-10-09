/**
 * O que muda nos textos entre Windows e Linux. O preload diz em que sistema o
 * Iris roda; os textos que citam o Windows (cofre, notificação, Lixeira,
 * firewall) leem daqui para não mentir no Linux.
 */

export const NO_LINUX = window.irisAPI.system.plataforma === 'linux';

/** "cofre do Windows" / "chaveiro do sistema" — onde ficam senhas e chaves (safeStorage). */
export const COFRE = NO_LINUX ? 'chaveiro do sistema' : 'cofre do Windows';

/** Para "notificação do Windows", "Lixeira do Windows"… */
export const DO_SISTEMA = NO_LINUX ? 'do sistema' : 'do Windows';
