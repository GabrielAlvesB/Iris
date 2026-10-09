import { MODULOS } from '../../shared/types/modulos.types.js';
import { idIrPara } from './atalhos.catalogo.js';
import { ligarAtalhos } from './atalhos.js';
import { abrirModulo, avancarModulo, voltarModulo } from './navegacao.js';
import { abrirBuscaRapida, definirFixado, estaFixado } from './sidebar.js';
import { alternarTema } from './tema.js';

/**
 * Quem executa os atalhos que valem no app inteiro: busca, ajuda, painel,
 * histórico e "ir para" cada módulo. Ligados uma vez, na abertura; os de cada
 * módulo são ligados no mount dele.
 */
export function ligarAtalhosGlobais(): void {
  const irPara = Object.fromEntries(MODULOS.map((m) => [idIrPara(m.id), () => abrirModulo(m.id)]));
  ligarAtalhos({
    ...irPara,
    'geral.busca': () => void abrirBuscaRapida(),
    // A ajuda é carregada no primeiro uso, como a busca.
    'geral.ajuda': () => void import('./atalhos.ajuda.js').then((m) => m.abrirAjudaAtalhos()),
    'geral.fixar': () => definirFixado(!estaFixado()),
    'geral.tema': () => void alternarTema().catch(() => undefined),
    'geral.voltar': () => voltarModulo(),
    'geral.avancar': () => avancarModulo(),
  });
}
