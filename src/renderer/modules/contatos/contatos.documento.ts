import type { AssinaturaRelatorio, PerfilUsuario } from '../../../shared/types/ajustes.types.js';
import {
  SITUACOES_CONTRATO,
  TIPOS_INTERACAO,
  TIPOS_REDE_CONTATO,
  TIPOS_TELEFONE,
  acharContato,
  nomeDoContato,
  refIgual,
  type ContatosFile,
  type Contrato,
  type EmpresaCrm,
  type Pessoa,
  type RefContato,
} from '../../../shared/types/contatos.types.js';
import { dataIsoCurta, dataIsoPorExtenso, enderecoPorExtenso, formatarMoeda, formatarTelefone, hojeLocal } from '../../../shared/types/brasil.js';
import { buildAssinatura, paragrafos } from '../../ui/documento.js';
import { exportarDocumentoPdf } from '../../ui/impressao.js';
import { openCustomModal } from '../../ui/modal.js';
import { buildBotao } from '../../ui/pagina.js';
import type { CtxContatos } from './contatos.casco.js';
import * as contatosState from './contatos.state.js';
import { ICONES_CONTATO, el, interacoesDe } from './contatos.ui.js';

/**
 * Documentos de papel do CRM — o contrato e a ficha do contato. Mesmo DOM na
 * prévia e no PDF (ui/impressao.ts), mesma família visual dos relatórios
 * (.rd-documento) e a mesma assinatura de Ajustes. Conteúdo do usuário entra
 * sempre por textContent.
 */

interface DadosDeAjustes {
  perfil: PerfilUsuario;
  assinatura: AssinaturaRelatorio;
}

/** Perfil e assinatura moram em Ajustes; lidos na hora, sem depender do state de lá estar carregado. */
export async function lerAjustes(): Promise<DadosDeAjustes> {
  const r = await window.irisAPI.ajustes.getAjustes();
  if (!r.ok) throw new Error(r.error);
  return { perfil: r.data.perfil, assinatura: r.data.assinatura };
}

function documentoDe(c: Pessoa | EmpresaCrm | undefined): string {
  if (!c) return '';
  return 'razaoSocial' in c ? c.cnpj : c.cpf;
}

/** Cabeçalho com os seus dados (de Ajustes): quem emite o documento. */
export function buildEmissor(perfil: PerfilUsuario): HTMLElement | null {
  if (!perfil.nome.trim()) return null;
  const cab = el('header', 'ct-doc-emissor');
  cab.appendChild(el('strong', undefined, perfil.nomeFantasia || perfil.nome));
  const linha = [perfil.documento, perfil.email, perfil.telefone].filter(Boolean).join(' · ');
  if (linha) cab.appendChild(el('span', undefined, linha));
  const endereco = enderecoPorExtenso(perfil.endereco);
  if (endereco) cab.appendChild(el('span', undefined, endereco));
  return cab;
}

// ---------- Contrato ----------

function linhaDeAssinatura(nome: string, detalhe: string): HTMLElement {
  const bloco = el('div', 'ct-doc-assina');
  bloco.appendChild(el('span', 'ct-doc-assina-linha'));
  bloco.appendChild(el('strong', undefined, nome || '________________________'));
  if (detalhe) bloco.appendChild(el('span', undefined, detalhe));
  return bloco;
}

/**
 * O contrato: seus dados no topo, o texto (com # títulos e **negrito**) e as
 * linhas de assinatura das duas partes no fim — os nomes e documentos vêm dos
 * cadastros, não do texto, para nunca faltar quem assina.
 */
export function buildDocumentoContrato(contrato: Contrato, perfil: PerfilUsuario, file: ContatosFile): HTMLElement {
  const doc = el('article', 'rd-documento ct-doc ct-doc-contrato');
  const emissor = buildEmissor(perfil);
  if (emissor) doc.appendChild(emissor);
  doc.appendChild(paragrafos(contrato.corpo, 'ct-doc-texto', { titulos: true }));

  const contato = acharContato(file, contrato.contato);
  const assinaturas = el('section', 'ct-doc-assinaturas');
  const meu = perfil.tipo === 'pj' && perfil.representante ? `${perfil.nome} — por ${perfil.representante}` : perfil.nome;
  assinaturas.append(
    linhaDeAssinatura(meu, perfil.documento),
    linhaDeAssinatura(contato ? ('razaoSocial' in contato ? contato.razaoSocial : contato.nome) : contrato.contatoNome, documentoDe(contato)),
  );
  doc.appendChild(assinaturas);
  return doc;
}

export async function exportarContratoPdf(contrato: Contrato, file: ContatosFile): Promise<void> {
  const { perfil } = await lerAjustes();
  await exportarDocumentoPdf(buildDocumentoContrato(contrato, perfil, file), () =>
    contatosState.exportarPdf({
      titulo: 'Exportar contrato em PDF',
      nomeArquivo: `${contrato.titulo} - ${contrato.contatoNome}`,
      rodape: `${contrato.titulo} · ${contrato.contatoNome}`,
    }),
  );
}

// ---------- Ficha ----------

export interface OpcoesFicha {
  dados: boolean;
  empresa: boolean;
  historico: boolean;
  /** Só registros a partir desta data (AAAA-MM-DD); vazio = todos. */
  historicoDesde: string;
  contratos: boolean;
  observacoes: boolean;
}

function par(rotulo: string, valor: string): HTMLElement | null {
  if (!valor.trim()) return null;
  const linha = el('div', 'ct-doc-par');
  linha.append(el('span', 'ct-doc-rotulo', rotulo), el('span', 'ct-doc-valor', valor));
  return linha;
}

function secaoDoc(titulo: string, ...filhos: Array<HTMLElement | null>): HTMLElement | null {
  const presentes = filhos.filter((f): f is HTMLElement => f !== null);
  if (!presentes.length) return null;
  const s = el('section', 'ct-doc-secao');
  s.appendChild(el('h2', 'ct-doc-titulo', titulo));
  const grade = el('div', 'ct-doc-grade');
  grade.append(...presentes);
  s.appendChild(grade);
  return s;
}

function dadosDo(c: Pessoa | EmpresaCrm, file: ContatosFile): Array<HTMLElement | null> {
  const etapa = file.etapas.find((e) => e.id === c.etapaId)?.nome ?? '';
  const comuns = [
    par('E-mail', c.emails.join(', ')),
    par('Telefone', c.telefones.map((t) => `${formatarTelefone(t.numero)} (${TIPOS_TELEFONE.find((x) => x.id === t.tipo)?.rotulo ?? t.tipo})`).join(', ')),
    par('Endereço', enderecoPorExtenso(c.endereco)),
    par('Redes', c.redes.map((r) => `${TIPOS_REDE_CONTATO.find((x) => x.id === r.tipo)?.rotulo ?? r.tipo}: ${r.valor}`).join(' · ')),
    par('Etapa', etapa),
    par('Origem', c.origem),
    par('Valor estimado', c.valorEstimado !== undefined ? formatarMoeda(c.valorEstimado) : ''),
    par('Tags', c.tags.join(', ')),
    par('Cadastrado em', dataIsoCurta(c.createdAt.slice(0, 10))),
  ];
  if ('razaoSocial' in c) {
    return [
      par('Razão social', c.razaoSocial),
      par('Nome fantasia', c.nomeFantasia),
      par('CNPJ', c.cnpj),
      par('Inscrição estadual', c.inscricaoEstadual),
      par('Segmento', c.segmento),
      ...comuns,
    ];
  }
  return [par('Nome', c.nome), par('Apelido', c.apelido), par('CPF', c.cpf), par('RG', c.rg), par('Nascimento', c.nascimento ? dataIsoCurta(c.nascimento) : ''), par('Cargo', c.cargo), ...comuns];
}

export function buildDocumentoFicha(file: ContatosFile, ref: RefContato, op: OpcoesFicha, ajustes: DadosDeAjustes): HTMLElement {
  const c = acharContato(file, ref)!;
  const doc = el('article', 'rd-documento ct-doc ct-doc-ficha');
  const emissor = buildEmissor(ajustes.perfil);
  if (emissor) doc.appendChild(emissor);

  const capa = el('header', 'ct-doc-capa');
  capa.append(el('span', 'ct-doc-sobre', ref.tipo === 'pessoa' ? 'Ficha de contato' : 'Ficha de empresa'), el('h1', undefined, nomeDoContato(c)));
  capa.appendChild(el('span', 'ct-doc-data', `Emitida em ${dataIsoPorExtenso(hojeLocal())}`));
  doc.appendChild(capa);

  if (op.dados) {
    const s = secaoDoc('Dados', ...dadosDo(c, file));
    if (s) doc.appendChild(s);
  }

  if (op.empresa) {
    if (!('razaoSocial' in c) && c.empresaId) {
      const empresa = file.empresas.find((e) => e.id === c.empresaId);
      if (empresa) {
        const s = secaoDoc(`Empresa: ${nomeDoContato(empresa)}`, par('Razão social', empresa.razaoSocial), par('CNPJ', empresa.cnpj), par('Endereço', enderecoPorExtenso(empresa.endereco)), par('Segmento', empresa.segmento));
        if (s) doc.appendChild(s);
      }
    } else if ('razaoSocial' in c) {
      const pessoas = file.pessoas.filter((p) => p.empresaId === c.id);
      if (pessoas.length) {
        const s = el('section', 'ct-doc-secao');
        s.appendChild(el('h2', 'ct-doc-titulo', 'Pessoas'));
        const lista = el('ul', 'ct-doc-lista');
        pessoas.forEach((p) => lista.appendChild(el('li', undefined, [p.nome, p.cargo, p.emails[0], p.telefones[0] ? formatarTelefone(p.telefones[0].numero) : ''].filter(Boolean).join(' · '))));
        s.appendChild(lista);
        doc.appendChild(s);
      }
    }
  }

  if (op.historico) {
    const itens = interacoesDe(file, ref).filter((i) => !op.historicoDesde || i.data.slice(0, 10) >= op.historicoDesde);
    if (itens.length) {
      const s = el('section', 'ct-doc-secao');
      s.appendChild(el('h2', 'ct-doc-titulo', op.historicoDesde ? `Histórico desde ${dataIsoCurta(op.historicoDesde)}` : 'Histórico'));
      itens.forEach((i) => {
        const item = el('div', 'ct-doc-hist');
        const tipo = i.tipo === 'evento' ? 'Registro' : (TIPOS_INTERACAO.find((t) => t.id === i.tipo)?.rotulo ?? i.tipo);
        item.append(el('span', 'ct-doc-hist-quando', `${dataIsoCurta(i.data.slice(0, 10))} ${i.data.slice(11, 16)}`), el('strong', undefined, tipo));
        item.appendChild(el('p', undefined, i.texto));
        s.appendChild(item);
      });
      doc.appendChild(s);
    }
  }

  if (op.contratos) {
    const contratos = file.contratos.filter((x) => refIgual(x.contato, ref));
    if (contratos.length) {
      const s = el('section', 'ct-doc-secao');
      s.appendChild(el('h2', 'ct-doc-titulo', 'Contratos'));
      const lista = el('ul', 'ct-doc-lista');
      contratos.forEach((x) => {
        const situacao = SITUACOES_CONTRATO.find((s2) => s2.id === x.situacao)?.rotulo ?? x.situacao;
        const ultima = x.historico[x.historico.length - 1];
        lista.appendChild(el('li', undefined, `${x.titulo} — ${situacao}${ultima ? ` em ${dataIsoCurta(ultima.em.slice(0, 10))}` : ''}`));
      });
      s.appendChild(lista);
      doc.appendChild(s);
    }
  }

  if (op.observacoes && c.observacoes.trim()) {
    const s = el('section', 'ct-doc-secao');
    s.appendChild(el('h2', 'ct-doc-titulo', 'Observações'));
    s.appendChild(paragrafos(c.observacoes, 'ct-doc-texto'));
    doc.appendChild(s);
  }

  const assinatura = buildAssinatura(ajustes.assinatura);
  if (assinatura) doc.appendChild(assinatura);
  return doc;
}

/** "O que entra" com prévia ao lado e "Exportar PDF". */
export function abrirFichaPdf(ctx: CtxContatos, ref: RefContato): void {
  const c = acharContato(ctx.file, ref);
  if (!c) return;
  const op: OpcoesFicha = { dados: true, empresa: true, historico: true, historicoDesde: '', contratos: true, observacoes: true };
  void lerAjustes()
    .then((ajustes) =>
      openCustomModal(
        `Ficha de ${nomeDoContato(c)}`,
        ({ corpo, rodape, fechar }) => {
          const grade = el('div', 'ct-pdf-grade');
          const opcoes = el('div', 'ct-pdf-opcoes');
          const previa = el('div', 'ct-pdf-previa');
          const desenhar = (): void => {
            previa.replaceChildren(buildDocumentoFicha(ctx.file, ref, op, ajustes));
          };
          const marca = (chave: Exclude<keyof OpcoesFicha, 'historicoDesde'>, rotulo: string, dica: string): HTMLElement => {
            const l = el('label', 'ct-pdf-opcao');
            const caixa = el('input');
            caixa.type = 'checkbox';
            caixa.checked = op[chave];
            caixa.addEventListener('change', () => {
              op[chave] = caixa.checked;
              desenhar();
            });
            const t = el('span', 'ct-pdf-opcao-textos');
            t.append(el('strong', undefined, rotulo), el('span', undefined, dica));
            l.append(caixa, t);
            return l;
          };
          const desde = el('input', 'md-input');
          desde.type = 'date';
          desde.addEventListener('change', () => {
            op.historicoDesde = desde.value;
            desenhar();
          });
          const desdeCampo = el('label', 'ct-pdf-desde');
          desdeCampo.append(el('span', undefined, 'Histórico a partir de'), desde);
          opcoes.append(
            el('p', 'ct-pdf-ajuda', 'Marque o que entra no documento. A prévia ao lado é exatamente o PDF.'),
            marca('dados', 'Dados', 'Documento, contatos, endereço, etapa'),
            marca('empresa', ref.tipo === 'pessoa' ? 'Empresa' : 'Pessoas', ref.tipo === 'pessoa' ? 'A empresa em que trabalha' : 'Quem trabalha nesta empresa'),
            marca('historico', 'Histórico', 'Conversas, reuniões e registros'),
            desdeCampo,
            marca('contratos', 'Contratos', 'Títulos e situação'),
            marca('observacoes', 'Observações', 'O texto livre da ficha'),
          );
          if (!ajustes.perfil.nome.trim()) {
            opcoes.appendChild(el('p', 'ct-pdf-aviso', 'Dica: preencha Ajustes › Seus dados para o documento sair com o seu cabeçalho.'));
          }
          grade.append(opcoes, previa);
          corpo.appendChild(grade);
          desenhar();

          const cancelar = buildBotao('Fechar', { variante: 'fantasma' });
          cancelar.addEventListener('click', fechar);
          const exportar = buildBotao('Exportar PDF', { variante: 'primario', icone: ICONES_CONTATO.pdf });
          exportar.addEventListener('click', () => {
            exportar.disabled = true;
            void exportarDocumentoPdf(buildDocumentoFicha(ctx.file, ref, op, ajustes), () =>
              contatosState.exportarPdf({ titulo: 'Exportar ficha em PDF', nomeArquivo: `Ficha - ${nomeDoContato(c)}`, rodape: `Ficha de ${nomeDoContato(c)}` }),
            )
              .catch(ctx.falhou)
              .finally(() => {
                exportar.disabled = false;
              });
          });
          rodape.append(cancelar, exportar);
        },
        { icone: ICONES_CONTATO.pdf, largura: 1040, subtitulo: 'Escolha o que entra no documento', classe: 'ct-pdf-modal' },
      ),
    )
    .catch(ctx.falhou);
}
