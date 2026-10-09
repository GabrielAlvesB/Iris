import { CAMPO_CHAVE, CAMPO_ISCA, CAMPO_REDIRECIONAR, CAMPOS_API, LIMITE_POR_MINUTO } from '../../../shared/types/leads.types.js';
import { buildSegmentado } from '../../ui/pagina.js';
import { ICONES_CONTATO, el } from '../contatos/contatos.ui.js';
import { cartao, codigo, status, valorCopiavel, type CtxApi } from './api-leads.pecas.js';

/**
 * "No seu site": o que pôr no formulário — a tabela de campos, os códigos
 * prontos (já com o endereço e a chave de verdade) e as respostas da API.
 */

type Destino = 'nuvem' | 'local';
type Exemplo = 'html' | 'fetch' | 'terminal';
type Terminal = 'curl' | 'powershell';

let destino: Destino | null = null;
let exemplo: Exemplo = 'html';
let terminal: Terminal = 'curl';

// ---------- No seu site ----------

function enderecoDe(ctx: CtxApi, d: Destino): string {
  if (d === 'nuvem') return ctx.file.leadsConfig.nuvem.url ? `${ctx.file.leadsConfig.nuvem.url}/v1/leads` : 'https://iris-leads.SUA-CONTA.workers.dev/v1/leads';
  return `${status?.servidor.endereco || `http://127.0.0.1:${ctx.file.leadsConfig.servidor.porta}`}/v1/leads`;
}

export function codigoHtml(endereco: string, chave: string): string {
  return `<form action="${endereco}" method="POST">
  <input type="hidden" name="${CAMPO_CHAVE}" value="${chave}">
  <input type="hidden" name="formulario" value="Contato do site">
  <!-- Depois de enviar, o navegador vai para esta página (troque pela sua): -->
  <input type="hidden" name="${CAMPO_REDIRECIONAR}" value="https://seusite.com.br/obrigado">

  <!-- Isca contra robôs: fica escondida; pessoa nenhuma preenche. -->
  <div style="position:absolute;left:-9999px" aria-hidden="true">
    <input type="text" name="${CAMPO_ISCA}" tabindex="-1" autocomplete="off">
  </div>

  <label>Nome <input name="nome" required></label>
  <label>E-mail <input name="email" type="email" required></label>
  <label>Telefone <input name="telefone" type="tel" required></label>
  <label>Empresa <input name="empresa"></label>
  <label>Mensagem <textarea name="mensagem"></textarea></label>
  <button type="submit">Enviar</button>
</form>`;
}

export function codigoFetch(endereco: string, chave: string): string {
  return `<form id="form-iris">
  <!-- Isca contra robôs: fica escondida; pessoa nenhuma preenche. -->
  <div style="position:absolute;left:-9999px" aria-hidden="true">
    <input type="text" name="${CAMPO_ISCA}" tabindex="-1" autocomplete="off">
  </div>
  <label>Nome <input name="nome" required></label>
  <label>E-mail <input name="email" type="email" required></label>
  <label>Telefone <input name="telefone" type="tel" required></label>
  <label>Empresa <input name="empresa"></label>
  <label>CNPJ <input name="cnpj"></label>
  <label>Mensagem <textarea name="mensagem"></textarea></label>
  <button type="submit">Enviar</button>
  <p id="form-iris-aviso" role="status"></p>
</form>

<script>
  (function () {
    var form = document.getElementById('form-iris');
    var aviso = document.getElementById('form-iris-aviso');
    form.addEventListener('submit', function (evento) {
      evento.preventDefault();
      var dados = Object.fromEntries(new FormData(form));
      // De onde a pessoa veio: as UTMs do link e a página.
      var url = new URL(location.href);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (k) {
        if (url.searchParams.get(k)) dados[k] = url.searchParams.get(k);
      });
      dados.pagina = location.href;
      dados.formulario = 'Contato do site';
      var botao = form.querySelector('button');
      botao.disabled = true;
      aviso.textContent = 'Enviando…';
      fetch('${endereco}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Iris-Chave': '${chave}' },
        body: JSON.stringify(dados)
      })
        .then(function (resposta) {
          return resposta.json().catch(function () { return {}; }).then(function (corpo) {
            if (resposta.ok) {
              form.reset();
              aviso.textContent = 'Recebemos sua mensagem! Logo entraremos em contato.';
            } else if (corpo.erros) {
              aviso.textContent = Object.values(corpo.erros).join(' ');
            } else {
              aviso.textContent = corpo.erro || 'Não foi possível enviar. Tente de novo.';
            }
          });
        })
        .catch(function () {
          aviso.textContent = 'Sem conexão. Tente de novo em instantes.';
        })
        .finally(function () {
          botao.disabled = false;
        });
    });
  })();
</script>`;
}

const EXEMPLO_TERMINAL = { nome: 'Maria Teste', email: 'maria@empresa.com.br', telefone: '11987654321', mensagem: 'Teste pelo terminal' };

export function codigoCurl(endereco: string, chave: string): string {
  // Aspas duplas por fora e \" por dentro: funciona no Prompt de Comando do Windows, no Mac e no Linux.
  const json = JSON.stringify(EXEMPLO_TERMINAL).replace(/"/g, '\\"');
  return `curl -X POST "${endereco}" -H "Content-Type: application/json" -H "X-Iris-Chave: ${chave}" -d "${json}"`;
}

export function codigoPowershell(endereco: string, chave: string): string {
  return `Invoke-RestMethod -Method Post -Uri "${endereco}" -ContentType "application/json" -Headers @{ "X-Iris-Chave" = "${chave}" } -Body '${JSON.stringify(EXEMPLO_TERMINAL)}'`;
}

export function buildNoSeuSite(ctx: CtxApi): HTMLElement {
  const { cartao: c, corpo } = cartao('site', ICONES_CONTATO.link, 'No seu site', 'O que pôr no formulário — os códigos já saem com o seu endereço e a sua chave');
  const temNuvem = Boolean(ctx.file.leadsConfig.nuvem.url);
  const d: Destino = destino ?? (temNuvem ? 'nuvem' : 'local');
  const endereco = enderecoDe(ctx, d);
  const chave = ctx.file.leadsConfig.chaveFormulario;

  const linhaDestino = el('div', 'la-destino');
  linhaDestino.appendChild(el('span', 'ct-campo-rotulo', 'Enviar para'));
  linhaDestino.appendChild(
    buildSegmentado<Destino>(
      [
        { value: 'nuvem', label: 'Caixa na nuvem' },
        { value: 'local', label: 'Servidor local' },
      ],
      d,
      (v) => {
        destino = v;
        ctx.redesenhar();
      },
    ),
  );
  corpo.appendChild(linhaDestino);
  corpo.appendChild(valorCopiavel(endereco, 'Endereço copiado'));
  if (d === 'nuvem' && !temNuvem) corpo.appendChild(el('p', 'la-aviso', 'Ainda sem caixa na nuvem: os códigos saem com um endereço de exemplo. Crie a caixa (seção Caixa na nuvem) e eles se atualizam sozinhos.'));
  if (d === 'local') corpo.appendChild(el('p', 'la-aviso', 'O servidor local só recebe deste computador (ou da rede da casa, se ligado). Um site publicado na internet precisa da caixa na nuvem.'));

  // Campos
  const tabela = el('div', 'la-campos');
  const cab = el('div', 'la-campo is-cabecalho');
  ['Campo', 'Situação', 'O que é', 'Exemplo'].forEach((t) => cab.appendChild(el('span', undefined, t)));
  tabela.appendChild(cab);
  const linhaCampo = (nome: string, situacao: string, obrigatorio: boolean, descricao: string, exemplo: string): void => {
    const l = el('div', 'la-campo');
    l.append(el('code', undefined, nome), el('span', obrigatorio ? 'la-obrigatorio' : 'la-opcional', situacao), el('span', undefined, descricao), el('span', 'la-exemplo', exemplo));
    tabela.appendChild(l);
  };
  CAMPOS_API.forEach((cp) => linhaCampo(cp.nome, cp.obrigatorio ? 'Obrigatório' : 'Opcional', cp.obrigatorio, cp.descricao, cp.exemplo));
  linhaCampo(CAMPO_CHAVE, 'Chave', true, 'A chave do formulário — ou no cabeçalho X-Iris-Chave', chave);
  linhaCampo(CAMPO_ISCA, 'Isca', false, 'Campo escondido: se vier preenchido, é robô e o envio é descartado em silêncio', '(vazio)');
  linhaCampo(CAMPO_REDIRECIONAR, 'Opcional', false, 'Para um <form> comum: para onde o navegador vai depois de enviar', 'https://seusite.com.br/obrigado');
  linhaCampo('qualquer outro', 'Opcional', false, 'Vira "informação extra" na ficha (até 30 campos)', 'orcamento=5000');
  corpo.appendChild(tabela);
  corpo.appendChild(el('p', 'la-nota', 'Aceita JSON (application/json) e o formato de um <form> comum (application/x-www-form-urlencoded). Nomes em inglês comuns também valem: name, phone, company, message.'));

  // Códigos
  corpo.appendChild(
    buildSegmentado<Exemplo>(
      [
        { value: 'html', label: 'Formulário HTML simples' },
        { value: 'fetch', label: 'Com JavaScript' },
        { value: 'terminal', label: 'Teste pelo terminal' },
      ],
      exemplo,
      (v) => {
        exemplo = v;
        ctx.redesenhar();
      },
    ),
  );
  if (exemplo === 'html') {
    corpo.appendChild(el('p', 'la-nota', 'Funciona em qualquer site, sem JavaScript. Depois de enviar, o navegador vai para a página de "_redirecionar" (troque pela sua página de obrigado).'));
    corpo.appendChild(codigo(codigoHtml(endereco, chave), 'Copiar formulário', 'Formulário copiado'));
  } else if (exemplo === 'fetch') {
    corpo.appendChild(el('p', 'la-nota', 'A pessoa fica na página e vê a mensagem de sucesso ou de erro. Também manda as UTMs do link e o endereço da página — o que aparece em "Como chegou" e nos gráficos de origem.'));
    corpo.appendChild(codigo(codigoFetch(endereco, chave), 'Copiar código', 'Código copiado'));
  } else {
    corpo.appendChild(
      buildSegmentado<Terminal>(
        [
          { value: 'curl', label: 'curl (Prompt de Comando, Mac, Linux)' },
          { value: 'powershell', label: 'PowerShell' },
        ],
        terminal,
        (v) => {
          terminal = v;
          ctx.redesenhar();
        },
      ),
    );
    corpo.appendChild(terminal === 'curl' ? codigo(codigoCurl(endereco, chave), 'Copiar comando', 'Comando copiado') : codigo(codigoPowershell(endereco, chave), 'Copiar comando', 'Comando copiado'));
  }

  const n8n = el('div', 'la-n8n');
  n8n.appendChild(el('strong', undefined, 'n8n, Zapier, Make, RD Station…'));
  n8n.appendChild(
    el(
      'p',
      undefined,
      `É um POST comum: método POST, o endereço acima, cabeçalho X-Iris-Chave com a chave do formulário e o corpo em JSON com nome, email e telefone (e os opcionais). Para o n8n, a seção n8n tem o fluxo pronto.`,
    ),
  );
  corpo.appendChild(n8n);

  // Respostas
  const respostas = el('div', 'la-campos is-respostas');
  const cabR = el('div', 'la-campo is-cabecalho');
  ['Código', 'Quando', 'Corpo'].forEach((t) => cabR.appendChild(el('span', undefined, t)));
  respostas.appendChild(cabR);
  (
    [
      ['201', 'Recebido', '{"ok":true}'],
      ['303', 'Recebido, com _redirecionar (vai para a sua página)', '—'],
      ['400', 'Faltou campo ou veio inválido — a mensagem é por campo', '{"ok":false,"erros":{"email":"E-mail inválido."}}'],
      ['401', 'Chave do formulário errada ou ausente', '{"ok":false,"erro":"Chave do formulário inválida."}'],
      ['403', 'Site fora da lista ORIGENS (só na caixa na nuvem)', '{"ok":false,"erro":"…"}'],
      ['413', 'Envio maior que 32 KB', '{"ok":false,"erro":"…"}'],
      ['429', `Mais de ${LIMITE_POR_MINUTO} envios por minuto do mesmo endereço`, '{"ok":false,"erro":"…"}'],
    ] as const
  ).forEach(([cod, quando, corpoR]) => {
    const l = el('div', 'la-campo');
    l.append(el('code', undefined, cod), el('span', undefined, quando), el('span', 'la-exemplo', corpoR));
    respostas.appendChild(l);
  });
  corpo.appendChild(el('span', 'ct-campo-rotulo', 'Respostas'));
  corpo.appendChild(respostas);
  return c;
}
