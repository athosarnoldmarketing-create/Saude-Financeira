// app.js — interface, navegação e ligação com as regras de negócio
import * as S from './store.js';
import * as F from './finance.js';
import { graficoDivergente, graficoLinha, graficoBarrasH, legenda } from './charts.js';
import {
  addDays, addMonths, dateLabel, dateLabelFull, escapeHTML, groupBy, monthAdd, monthKey,
  monthLabel, monthLabelLong, money, moneyPlain, moneyShort, normalizeText, relDateLabel,
  todayISO, toCents, uid, sum, weekdayAbbr, diffDays, monthRange,
} from './util.js';

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

/* ------------------------------------------------------------- ícones */

const ICO = {
  inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.2"/><circle cx="3.5" cy="12" r="1.2"/><circle cx="3.5" cy="18" r="1.2"/>',
  fluxo: '<path d="M3 20V10M9 20V4M15 20v-7M21 20V7"/>',
  repetir: '<path d="M17 2.5 20.5 6 17 9.5"/><path d="M20.5 6H7a3.5 3.5 0 0 0 0 7h1"/><path d="M7 21.5 3.5 18 7 14.5"/><path d="M3.5 18H17a3.5 3.5 0 0 0 0-7h-1"/>',
  mais: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  volta: '<path d="M15 5l-7 7 7 7"/>',
  engrenagem: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
};
const svg = (d, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${d}</svg>`;

/* ------------------------------------------------------------- estado UI */

const ui = {
  rota: 'inicio',
  mes: monthKey(todayISO()),
  filtroTipo: 'todos',
  filtroStatus: 'todos',
  busca: '',
  fluxoJanela: 4,
  abaRecorrente: 'saida',
};

const st = () => S.get();
const cat = (id) => st().categories.find((c) => c.id === id);
const cartao = (id) => st().cards.find((c) => c.id === id);
const catNome = (id) => cat(id)?.nome || 'Sem categoria';
const catIcone = (id) => cat(id)?.icone || '💸';
const catCor = (id) => cat(id)?.cor || 'var(--ink-3)';

/* ------------------------------------------------------------- toast */

let toastTimer;
function toast(msg) {
  $('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

/* =====================================================================
   TELA 1 — Início (dashboard)
   ===================================================================== */

function telaInicio() {
  const s = st();
  const hoje = todayISO();
  const mkAtual = monthKey(hoje);
  const resumo = F.resumoMes(s, mkAtual);
  const saldoHoje = F.saldoRealizado(s, hoje);
  const fimMes = monthRange(mkAtual).end;
  const saldoFim = F.saldoProjetado(s, fimMes);
  const semanas = F.provisaoSemanal(s, { semanas: 5, hoje });
  const pend = F.pendencias(s, { dias: 7, hoje });
  const atrasadas = pend.filter((p) => p.atrasado);
  const orcamento = F.orcamentoMes(s, mkAtual).filter((o) => o.orcamento > 0 || o.gasto > 0).slice(0, 5);
  const fats = F.faturas(s, hoje, addDays(hoje, 60)).filter((f) => f.total > 0 && !f.pago);
  const metas = F.progressoMetas(s);
  const sugestoes = F.sugestoesRecorrencia(s);
  const semDados = s.transactions.filter((t) => !t.deleted).length === 0;

  return `
  <div class="tela">
    <div class="cabecalho">
      <div>
        <h1>${escapeHTML(s.settings.lar || 'Nossa casa')}</h1>
        <div class="sub">${monthLabelLong(mkAtual)} · ${relDateLabel(hoje)}</div>
      </div>
      <button class="icone-btn" data-acao="abrir-ajustes" aria-label="Ajustes">${svg(ICO.engrenagem)}</button>
    </div>

    ${semDados ? boasVindas() : ''}

    <div class="hero">
      <div class="rot">Saldo em caixa hoje</div>
      <div class="valor ${saldoHoje < 0 ? 'neg' : ''} tabular">${money(saldoHoje)}</div>
      <div class="nota">Projeção até ${dateLabel(fimMes)}: <b class="tabular">${money(saldoFim)}</b></div>
      <div class="hero-grid">
        <div class="mini">
          <div class="rot"><i style="background:var(--entrada)"></i>Entradas do mês</div>
          <div class="n tabular">${money(resumo.entradas)}</div>
          <div class="p">${money(resumo.entradasRealizadas)} já recebido</div>
        </div>
        <div class="mini">
          <div class="rot"><i style="background:var(--saida)"></i>Saídas do mês</div>
          <div class="n tabular">${money(resumo.saidas)}</div>
          <div class="p">${money(resumo.saidasPrevistas)} ainda previsto</div>
        </div>
      </div>
    </div>

    ${atrasadas.length ? `
      <div class="card compacto" style="margin-top:12px">
        <div class="aviso alerta">
          <span>⚠️</span>
          <div><b>${atrasadas.length} ${atrasadas.length === 1 ? 'conta venceu' : 'contas venceram'} e ${atrasadas.length === 1 ? 'não foi marcada' : 'não foram marcadas'} como paga${atrasadas.length === 1 ? '' : 's'}</b>
          <div style="margin-top:4px">${escapeHTML(atrasadas.slice(0, 3).map((p) => p.descricao).join(' · '))}</div>
          <button class="btn pequeno secundario" style="margin-top:8px" data-acao="ir" data-rota="lancamentos" data-status="previsto">Ver pendências</button></div>
        </div>
      </div>` : ''}

    <div class="secao-titulo">
      <h2>Provisão das próximas semanas</h2>
      <button class="acao" data-acao="ir" data-rota="fluxo">Fluxo completo</button>
    </div>
    <div class="card">
      ${legenda([{ nome: 'Entradas', cor: 'var(--serie-entrada)' }, { nome: 'Saídas', cor: 'var(--serie-saida)' }])}
      <div id="viz-semanas" class="viz" style="margin-top:6px"></div>
      <div style="margin-top:12px">
        ${semanas.map((w) => `
          <div class="semana ${w.atual ? 'atual' : ''}">
            <div class="quando">
              <b>${w.atual ? 'Esta semana' : dateLabel(w.inicio)}</b>
              <span>${dateLabel(w.inicio)} a ${dateLabel(w.fim)}</span>
            </div>
            <div class="nums">
              <div>Entram<b class="pos tabular">${moneyShort(w.entradas)}</b></div>
              <div>Saem<b class="neg tabular">${moneyShort(w.saidas)}</b></div>
              <div>Saldo ao fim<b class="tabular ${w.saldoFim < 0 ? 'neg' : ''}">${moneyShort(w.saldoFim)}</b></div>
            </div>
          </div>`).join('')}
      </div>
      ${semanas.some((w) => w.saldoFim < 0) ? `<div class="aviso alerta" style="margin-top:6px"><span>🔴</span><div>O saldo projetado fica negativo em alguma dessas semanas. Vale antecipar uma entrada ou renegociar um vencimento.</div></div>` : ''}
    </div>

    ${pend.length ? `
      <div class="secao-titulo"><h2>Pendências e vencimentos da semana</h2></div>
      ${pend.slice(0, 6).map((p) => itemLancamento(p, { mostrarData: true })).join('')}` : ''}

    ${fats.length ? `
      <div class="secao-titulo"><h2>Faturas de cartão em aberto</h2></div>
      ${fats.map((f) => `
        <button class="item" data-acao="ver-fatura" data-id="${f.id}">
          <span class="ic" style="background:${f.cor || 'var(--surface-3)'}22">💳</span>
          <span class="corpo">
            <span class="t">${escapeHTML(f.cartao)}</span>
            <span class="s">vence ${dateLabel(f.dataVencimento)} · ${f.itens.length} compra${f.itens.length === 1 ? '' : 's'}</span>
          </span>
          <span class="v saida tabular">${money(f.total)}</span>
        </button>`).join('')}` : ''}

    ${orcamento.length ? `
      <div class="secao-titulo">
        <h2>Orçamento de ${monthLabelLong(mkAtual).split(' de ')[0]}</h2>
        <button class="acao" data-acao="abrir-categorias">Ajustar</button>
      </div>
      <div class="card">
        ${orcamento.map((o) => blocoOrcamento(o)).join('<div style="height:14px"></div>')}
      </div>` : ''}

    ${metas.length ? `
      <div class="secao-titulo"><h2>Metas</h2><button class="acao" data-acao="abrir-metas">Ver todas</button></div>
      <div class="card">${metas.slice(0, 3).map((m) => blocoMeta(m)).join('<div style="height:14px"></div>')}</div>` : ''}

    ${sugestoes.length ? `
      <div class="secao-titulo"><h2>Repetições identificadas</h2></div>
      <div class="card">
        <div class="aviso info" style="margin-bottom:12px"><span>🔍</span><div>Esses lançamentos se repetem com a mesma origem. Transformar em recorrência faz eles aparecerem sozinhos na provisão.</div></div>
        ${sugestoes.slice(0, 4).map((sg) => `
          <div class="item" style="cursor:default">
            <span class="ic">${sg.tipo === 'entrada' ? '📥' : '🔁'}</span>
            <span class="corpo">
              <span class="t">${escapeHTML(sg.descricao)}</span>
              <span class="s">${sg.ocorrencias}x em ${sg.meses} meses · ~${money(sg.valorMediano)} · dia ${sg.diaTipico}</span>
            </span>
            <button class="btn pequeno principal" data-acao="criar-recorrencia-sugerida" data-chave="${escapeHTML(sg.chave)}">Criar</button>
          </div>`).join('')}
      </div>` : ''}
  </div>`;
}

function boasVindas() {
  return `
    <div class="card" style="margin-bottom:12px">
      <div style="font-size:15px;font-weight:700;margin-bottom:6px">Bem-vindos 👋</div>
      <p style="margin:0 0 12px;font-size:13.5px;color:var(--ink-2)">
        Comece informando quanto vocês têm hoje em conta e registre o primeiro lançamento.
        As contas fixas podem virar recorrências e aparecer sozinhas na provisão.
      </p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn pequeno principal" data-acao="abrir-saldo-inicial">Informar saldo atual</button>
        <button class="btn pequeno secundario" data-acao="novo-lancamento">Registrar lançamento</button>
        <button class="btn pequeno secundario" data-acao="nova-recorrencia">Cadastrar conta fixa</button>
      </div>
    </div>`;
}

function blocoOrcamento(o) {
  const pct = o.orcamento > 0 ? Math.min(1.35, o.gasto / o.orcamento) : 0;
  const cls = o.status === 'estourado' ? 'estourado' : o.status === 'atencao' ? 'atencao' : '';
  return `
    <div class="prog">
      <div class="prog-topo">
        <span class="nome"><span>${o.categoria.icone || '•'} ${escapeHTML(o.categoria.nome)}</span></span>
        <span class="val tabular">${money(o.gasto)}${o.orcamento > 0 ? ` / ${money(o.orcamento)}` : ''}</span>
      </div>
      <div class="trilho ${cls}"><i style="width:${Math.max(2, pct * 100)}%;${o.orcamento > 0 ? '' : `background:${o.categoria.cor}`}"></i></div>
      ${o.orcamento > 0 ? `<div class="dica" style="font-size:12px;color:${o.saldo < 0 ? 'var(--critico)' : 'var(--ink-3)'};margin-top:5px">
        ${o.saldo < 0 ? `Estourou ${money(-o.saldo)}` : `Restam ${money(o.saldo)}`}</div>` : ''}
    </div>`;
}

function blocoMeta(m) {
  const pct = Math.min(1, Math.max(0, m.pct || 0));
  return `
    <button class="prog" style="width:100%;text-align:left" data-acao="editar-meta" data-id="${m.id}">
      <div class="prog-topo">
        <span class="nome"><span>${m.icone || '🎯'} ${escapeHTML(m.nome)}</span></span>
        <span class="val tabular">${money(m.acumulado)} / ${money(m.alvo)}</span>
      </div>
      <div class="trilho"><i style="width:${Math.max(2, pct * 100)}%;background:${m.cor || 'var(--marca)'}"></i></div>
      <div style="font-size:12px;color:var(--ink-3);margin-top:5px">
        ${Math.round(pct * 100)}% concluído${m.mensalNecessario ? ` · guardar ${money(m.mensalNecessario)}/mês até ${dateLabel(m.prazo)}` : ''}
      </div>
    </button>`;
}

/* =====================================================================
   TELA 2 — Lançamentos
   ===================================================================== */

function telaLancamentos() {
  const s = st();
  const { start, end } = monthRange(ui.mes);
  let itens = s.transactions.filter((t) => !t.deleted && t.data >= start && t.data <= end);
  if (ui.filtroTipo !== 'todos') itens = itens.filter((t) => t.tipo === ui.filtroTipo);
  if (ui.filtroStatus === 'previsto') itens = itens.filter((t) => !t.pago);
  if (ui.filtroStatus === 'efetivado') itens = itens.filter((t) => t.pago);
  if (ui.busca.trim()) {
    const q = normalizeText(ui.busca);
    itens = itens.filter((t) => normalizeText(t.descricao).includes(q) || normalizeText(catNome(t.categoriaId)).includes(q));
  }
  itens.sort((a, b) => b.data.localeCompare(a.data) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  const totEnt = sum(itens.filter((t) => t.tipo === 'entrada'), (t) => t.valor);
  const totSai = sum(itens.filter((t) => t.tipo === 'saida'), (t) => t.valor);
  const porDia = groupBy(itens, (t) => t.data);

  return `
  <div class="tela">
    ${seletorMes('Lançamentos')}
    <div class="seg" style="margin-bottom:10px">
      ${[['todos', 'Tudo'], ['entrada', 'Entradas'], ['saida', 'Saídas']]
        .map(([v, r]) => `<button data-acao="filtro-tipo" data-valor="${v}" aria-selected="${ui.filtroTipo === v}">${r}</button>`).join('')}
    </div>
    <div class="chips" style="margin-bottom:10px">
      ${[['todos', 'Todos'], ['previsto', 'Só previstos'], ['efetivado', 'Só efetivados']]
        .map(([v, r]) => `<button class="chip" data-acao="filtro-status" data-valor="${v}" aria-pressed="${ui.filtroStatus === v}">${r}</button>`).join('')}
    </div>
    <input type="text" placeholder="Buscar por descrição ou categoria" value="${escapeHTML(ui.busca)}" data-acao="busca" style="margin-bottom:12px">

    <div class="tiles" style="grid-template-columns:1fr 1fr 1fr">
      <div class="tile"><div class="rot">Entradas</div><div class="n pos tabular">${moneyShort(totEnt)}</div></div>
      <div class="tile"><div class="rot">Saídas</div><div class="n neg tabular">${moneyShort(totSai)}</div></div>
      <div class="tile"><div class="rot">Resultado</div><div class="n tabular">${moneyShort(totEnt - totSai)}</div></div>
    </div>

    ${itens.length === 0 ? `
      <div class="vazio"><span class="emoji">🗒️</span><b>Nada por aqui</b><p>Nenhum lançamento com esses filtros em ${monthLabelLong(ui.mes)}.</p>
      <button class="btn principal" style="flex:0" data-acao="novo-lancamento">Registrar lançamento</button></div>` :
      [...porDia.entries()].map(([dia, lista]) => `
        <div class="lista-titulo">
          <span>${relDateLabel(dia)}</span>
          <span class="tabular">${money(sum(lista, (t) => (t.tipo === 'entrada' ? t.valor : -t.valor)))}</span>
        </div>
        ${lista.map((t) => itemLancamento(t)).join('')}`).join('')}
  </div>`;
}

function itemLancamento(t, { mostrarData = false } = {}) {
  const c = t.cartaoId ? cartao(t.cartaoId) : null;
  const detalhes = [];
  if (mostrarData) detalhes.push(relDateLabel(t.data));
  if (t.categoriaId) detalhes.push(catNome(t.categoriaId));
  if (t.metodo === 'credito' && c) detalhes.push(c.nome);
  if (t.parcela) detalhes.push(`${t.parcela.n}/${t.parcela.total}`);
  if (t.pessoa) detalhes.push(t.pessoa);
  const virtual = t.virtual;
  return `
    <button class="item ${t.pago ? '' : 'previsto'} ${!t.pago && t.data < todayISO() ? 'atrasado' : ''}"
            data-acao="${virtual ? 'ver-fatura' : 'editar-lancamento'}" data-id="${virtual ? t.faturaId : t.id}">
      <span class="ic" style="background:${t.tipo === 'entrada' ? 'var(--entrada-suave)' : 'var(--surface-3)'}">${virtual ? '💳' : (t.tipo === 'entrada' ? '📥' : catIcone(t.categoriaId))}</span>
      <span class="corpo">
        <span class="t">${escapeHTML(t.descricao || 'Sem descrição')}</span>
        <span class="s">
          ${escapeHTML(detalhes.join(' · '))}
          ${t.recorrenciaId ? '<span class="tag rec">fixa</span>' : ''}
          ${!t.pago ? (t.data < todayISO() ? '<span class="tag atraso">atrasado</span>' : '<span class="tag prev">previsto</span>') : ''}
        </span>
      </span>
      <span class="v ${t.tipo} tabular">${t.tipo === 'entrada' ? '+' : '−'} ${moneyPlain(t.valor)}</span>
    </button>`;
}

function seletorMes(titulo) {
  return `
    <div class="cabecalho">
      <div>
        <h1>${titulo}</h1>
        <div class="sub">${monthLabelLong(ui.mes)}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="icone-btn" data-acao="mes" data-delta="-1" aria-label="Mês anterior">${svg(ICO.volta)}</button>
        <button class="icone-btn" data-acao="mes" data-delta="1" aria-label="Próximo mês" style="transform:scaleX(-1)">${svg(ICO.volta)}</button>
      </div>
    </div>`;
}

/* =====================================================================
   TELA 3 — Fluxo de caixa
   ===================================================================== */

function telaFluxo() {
  const s = st();
  const mkHoje = monthKey(todayISO());
  const de = monthAdd(mkHoje, -(ui.fluxoJanela - 1));
  const ate = monthAdd(mkHoje, 3);
  const serie = F.fluxoCaixa(s, de, ate);
  const media = F.mediaMensal(s, monthAdd(mkHoje, -1), 3);
  const topGastos = F.topDescricoes(s, ui.mes, 6);
  const composicao = F.orcamentoMes(s, ui.mes).filter((o) => o.gasto > 0).slice(0, 8);

  return `
  <div class="tela">
    <div class="cabecalho">
      <div><h1>Fluxo de caixa</h1><div class="sub">${monthLabel(de)} até ${monthLabel(ate)}</div></div>
    </div>

    <div class="card">
      ${legenda([{ nome: 'Entradas', cor: 'var(--serie-entrada)' }, { nome: 'Saídas', cor: 'var(--serie-saida)' }])}
      <div id="viz-fluxo" class="viz" style="margin-top:6px"></div>
    </div>

    <div class="secao-titulo"><h2>Saldo acumulado projetado</h2></div>
    <div class="card"><div id="viz-saldo" class="viz"></div></div>

    <div class="secao-titulo"><h2>Mês a mês</h2></div>
    <div class="card">
      <div class="rolagem-x">
        <table class="tabela">
          <thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Resultado</th><th>Saldo</th></tr></thead>
          <tbody>
            ${serie.map((m) => `
              <tr class="${m.mk === mkHoje ? 'destaque' : ''}">
                <td>${monthLabel(m.mk)}${m.mk > mkHoje ? ' *' : ''}</td>
                <td class="pos">${moneyPlain(m.entradas)}</td>
                <td class="neg">${moneyPlain(m.saidas)}</td>
                <td class="${m.resultado < 0 ? 'neg' : 'pos'}">${moneyPlain(m.resultado)}</td>
                <td>${moneyPlain(m.saldoFim)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="dica" style="margin-top:10px;font-size:12px;color:var(--ink-3)">* meses futuros consideram recorrências, parcelas e faturas já lançadas.</div>
    </div>

    <div class="tiles" style="margin-top:12px">
      <div class="tile"><div class="rot">Entrada média (3m)</div><div class="n pos tabular">${moneyShort(media.entradas)}</div></div>
      <div class="tile"><div class="rot">Saída média (3m)</div><div class="n neg tabular">${moneyShort(media.saidas)}</div></div>
      <div class="tile"><div class="rot">Sobra média</div><div class="n tabular">${moneyShort(media.entradas - media.saidas)}</div></div>
      <div class="tile"><div class="rot">Reserva sugerida</div><div class="n tabular">${moneyShort(media.saidas * (st().settings.reservaAlvoMeses || 6))}</div><div class="p">${st().settings.reservaAlvoMeses || 6} meses de custo</div></div>
    </div>

    ${composicao.length ? `
      <div class="secao-titulo"><h2>Para onde foi o dinheiro em ${monthLabel(ui.mes)}</h2>
        <button class="acao" data-acao="mes" data-delta="-1">Mês anterior</button></div>
      <div class="card"><div id="viz-categorias" class="viz"></div></div>` : ''}

    ${topGastos.length ? `
      <div class="secao-titulo"><h2>Maiores destinos</h2></div>
      <div class="card">
        ${topGastos.map((g) => `
          <div class="item" style="cursor:default;margin-bottom:6px">
            <span class="ic">${catIcone(g.categoriaId)}</span>
            <span class="corpo"><span class="t">${escapeHTML(g.descricao)}</span>
            <span class="s">${g.vezes}x em ${monthLabel(ui.mes)} · ${escapeHTML(catNome(g.categoriaId))}</span></span>
            <span class="v tabular">${moneyPlain(g.total)}</span>
          </div>`).join('')}
      </div>` : ''}
  </div>`;
}

/* =====================================================================
   TELA 4 — Recorrentes
   ===================================================================== */

const FREQ_ROTULO = { mensal: 'Todo mês', semanal: 'Toda semana', quinzenal: 'A cada 15 dias', anual: 'Uma vez por ano' };

function telaRecorrentes() {
  const s = st();
  const lista = s.recurrences.filter((r) => !r.deleted && r.tipo === ui.abaRecorrente);
  const sugestoes = F.sugestoesRecorrencia(s).filter((sg) => sg.tipo === ui.abaRecorrente);
  const totalMes = sum(lista.filter((r) => r.ativo !== false && r.frequencia === 'mensal'), (r) => r.valor);

  return `
  <div class="tela">
    <div class="cabecalho">
      <div><h1>Recorrentes</h1><div class="sub">O que se repete todo mês, sem precisar lançar de novo</div></div>
    </div>

    <div class="seg" style="margin-bottom:12px">
      <button data-acao="aba-recorrente" data-valor="saida" aria-selected="${ui.abaRecorrente === 'saida'}">Saídas fixas</button>
      <button data-acao="aba-recorrente" data-valor="entrada" aria-selected="${ui.abaRecorrente === 'entrada'}">Entradas fixas</button>
    </div>

    <div class="card compacto" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:12px;color:var(--ink-3);font-weight:600">Compromisso mensal ${ui.abaRecorrente === 'saida' ? 'de saída' : 'de entrada'}</div>
          <div style="font-size:23px;font-weight:700;letter-spacing:-.02em" class="tabular">${money(totalMes)}</div>
        </div>
        <button class="btn pequeno principal" data-acao="nova-recorrencia">Nova</button>
      </div>
    </div>

    ${lista.length === 0 ? `
      <div class="vazio"><span class="emoji">🔁</span><b>Nenhuma recorrência cadastrada</b>
      <p>Aluguel, escola, salário, assinaturas: cadastre uma vez e o app projeta os meses seguintes sozinho.</p>
      <button class="btn principal" style="flex:0" data-acao="nova-recorrencia">Cadastrar a primeira</button></div>` :
      lista.map((r) => {
        const prox = F.occurrencesBetween(r, todayISO(), addMonths(todayISO(), 2))[0];
        return `
        <button class="item ${r.ativo === false ? 'previsto' : ''}" data-acao="editar-recorrencia" data-id="${r.id}">
          <span class="ic" style="background:${r.tipo === 'entrada' ? 'var(--entrada-suave)' : 'var(--surface-3)'}">${r.tipo === 'entrada' ? '📥' : catIcone(r.categoriaId)}</span>
          <span class="corpo">
            <span class="t">${escapeHTML(r.descricao)}</span>
            <span class="s">${FREQ_ROTULO[r.frequencia] || 'Todo mês'}${r.frequencia === 'mensal' ? `, dia ${r.diaMes}` : ''} · ${escapeHTML(catNome(r.categoriaId))}
            ${r.ativo === false ? '<span class="tag">pausada</span>' : prox ? `<span class="tag">próx. ${dateLabel(prox)}</span>` : ''}</span>
          </span>
          <span class="v ${r.tipo} tabular">${r.tipo === 'entrada' ? '+' : '−'} ${moneyPlain(r.valor)}</span>
        </button>`;
      }).join('')}

    ${sugestoes.length ? `
      <div class="secao-titulo"><h2>Detectamos repetições</h2></div>
      <div class="card">
        <div class="aviso info" style="margin-bottom:12px"><span>🔍</span><div>Mesma loja, mesmo destino ou mesma origem aparecendo várias vezes. Confirme para virar recorrência.</div></div>
        ${sugestoes.map((sg) => `
          <div class="item" style="cursor:default">
            <span class="ic">${sg.tipo === 'entrada' ? '📥' : '🔁'}</span>
            <span class="corpo"><span class="t">${escapeHTML(sg.descricao)}</span>
            <span class="s">${sg.ocorrencias}x · ${sg.valorFixo ? 'valor estável' : 'valor variável'} · ~${money(sg.valorMediano)} · dia ${sg.diaTipico}</span></span>
            <button class="btn pequeno principal" data-acao="criar-recorrencia-sugerida" data-chave="${escapeHTML(sg.chave)}">Criar</button>
          </div>`).join('')}
      </div>` : ''}
  </div>`;
}

/* =====================================================================
   TELA 5 — Mais
   ===================================================================== */

function telaMais() {
  const s = st();
  const sync = S.sync;
  const nTx = s.transactions.filter((t) => !t.deleted).length;
  const estadoSync = { desligado: 'Só neste aparelho', conectando: 'Conectando…', ok: 'Sincronizado', erro: 'Erro na sincronização' }[sync.estadoAtual];

  const linha = (acao, icone, titulo, sub) => `
    <button class="item" data-acao="${acao}">
      <span class="ic">${icone}</span>
      <span class="corpo"><span class="t">${titulo}</span><span class="s">${sub}</span></span>
      <span style="color:var(--ink-3)">›</span>
    </button>`;

  return `
  <div class="tela">
    <div class="cabecalho"><div><h1>Mais</h1><div class="sub">${nTx} lançamentos registrados</div></div></div>

    <div class="secao-titulo"><h2>Cadastros</h2></div>
    ${linha('abrir-categorias', '🏷️', 'Categorias e orçamento', `${s.categories.filter((c) => !c.deleted).length} categorias`)}
    ${linha('abrir-cartoes', '💳', 'Cartões de crédito', `${s.cards.filter((c) => !c.deleted).length} cadastrados`)}
    ${linha('abrir-metas', '🎯', 'Metas e reserva', `${s.goals.filter((g) => !g.deleted).length} metas`)}

    <div class="secao-titulo"><h2>Configurações</h2></div>
    ${linha('abrir-saldo-inicial', '🏦', 'Saldo inicial', `${money(s.settings.saldoInicial)} em ${dateLabelFull(s.settings.saldoInicialData)}`)}
    ${linha('abrir-ajustes', '⚙️', 'Casa, pessoas e tema', escapeHTML((s.settings.pessoas || []).join(', ')))}
    ${linha('abrir-sync', '☁️', 'Sincronizar entre celulares', estadoSync)}

    <div class="secao-titulo"><h2>Dados</h2></div>
    ${linha('exportar-csv', '📤', 'Exportar para planilha (CSV)', 'Abre no Excel e Google Sheets')}
    ${linha('exportar-json', '💾', 'Backup completo (JSON)', 'Guarde uma cópia de segurança')}
    ${linha('importar-json', '📥', 'Restaurar backup', 'Substitui os dados deste aparelho')}

    <div class="card" style="margin-top:18px">
      <div style="font-size:13px;color:var(--ink-3)">
        <b style="color:var(--ink)">Saúde Financeira</b> · versão 1.0<br>
        Os dados ficam no seu aparelho e, se a sincronização estiver ligada, na sua conta em nuvem.
        Ninguém mais tem acesso.
      </div>
    </div>
  </div>`;
}

/* =====================================================================
   Sheets (modais)
   ===================================================================== */

let sheetAberta = null;

function abrirSheet({ titulo, corpo, rodape, aoMontar }) {
  fecharSheet();
  const fundo = document.createElement('div');
  fundo.className = 'sheet-fundo';
  fundo.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${escapeHTML(titulo)}">
      <div class="sheet-topo">
        <button data-acao="fechar-sheet">Cancelar</button>
        <h3>${escapeHTML(titulo)}</h3>
        <span style="width:56px"></span>
      </div>
      <div class="sheet-corpo">${corpo}</div>
      ${rodape ? `<div class="sheet-rodape">${rodape}</div>` : ''}
    </div>`;
  document.body.appendChild(fundo);
  document.body.style.overflow = 'hidden';
  sheetAberta = fundo;
  fundo.addEventListener('click', (e) => { if (e.target === fundo) fecharSheet(); });
  aoMontar?.(fundo);
  return fundo;
}

function fecharSheet() {
  sheetAberta?.remove();
  sheetAberta = null;
  document.body.style.overflow = '';
}

/* -------------------------------------------------- sheet de lançamento */

function sheetLancamento(txExistente = null, preset = {}) {
  const s = st();
  const novo = !txExistente;
  const t = txExistente || {
    id: uid(), tipo: preset.tipo || 'saida', valor: 0, data: todayISO(), descricao: '',
    categoriaId: null, metodo: 'pix', cartaoId: null, pessoa: (s.settings.pessoas || [])[0] || null,
    pago: true, parcela: null, metaId: null, obs: '', recorrenciaId: null,
  };
  const descricoes = [...new Set(s.transactions.filter((x) => !x.deleted).map((x) => x.descricao).filter(Boolean))].slice(-60);
  const cats = s.categories.filter((c) => !c.deleted);

  const corpo = `
    <form id="form-tx" novalidate>
      <div class="seg" style="margin-bottom:16px">
        <button type="button" data-campo="tipo" data-valor="saida" aria-selected="${t.tipo === 'saida'}">Saída</button>
        <button type="button" data-campo="tipo" data-valor="entrada" aria-selected="${t.tipo === 'entrada'}">Entrada</button>
      </div>

      <div class="campo">
        <label for="tx-valor">Valor</label>
        <div class="valor-input ${t.tipo}">
          <span>R$</span>
          <input id="tx-valor" name="valor" inputmode="decimal" placeholder="0,00" value="${t.valor ? moneyPlain(t.valor) : ''}" autocomplete="off">
        </div>
      </div>

      <div class="campo">
        <label for="tx-desc">Descrição — loja, pessoa ou origem</label>
        <input id="tx-desc" name="descricao" list="lista-desc" value="${escapeHTML(t.descricao)}" placeholder="Ex.: Supermercado Bom Preço" autocomplete="off">
        <datalist id="lista-desc">${descricoes.map((d) => `<option value="${escapeHTML(d)}"></option>`).join('')}</datalist>
      </div>

      <div class="linha2">
        <div class="campo">
          <label for="tx-data">Data</label>
          <input id="tx-data" name="data" type="date" value="${t.data}">
        </div>
        <div class="campo">
          <label for="tx-cat">Categoria</label>
          <select id="tx-cat" name="categoriaId">
            <option value="">Sem categoria</option>
            ${cats.map((c) => `<option value="${c.id}" data-tipo="${c.tipo}" ${t.categoriaId === c.id ? 'selected' : ''}>${c.icone} ${escapeHTML(c.nome)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="campo">
        <label>Forma de pagamento</label>
        <div class="opcoes" id="grupo-metodo">
          ${F.METODOS.map((m) => `<button type="button" class="opcao" data-campo="metodo" data-valor="${m.id}" aria-pressed="${t.metodo === m.id}">${m.nome}</button>`).join('')}
        </div>
      </div>

      <div id="bloco-cartao" ${t.metodo === 'credito' ? '' : 'hidden'}>
        <div class="linha2">
          <div class="campo">
            <label for="tx-cartao">Cartão</label>
            <select id="tx-cartao" name="cartaoId">
              <option value="">Selecione</option>
              ${s.cards.filter((c) => !c.deleted).map((c) => `<option value="${c.id}" ${t.cartaoId === c.id ? 'selected' : ''}>${escapeHTML(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="campo">
            <label for="tx-parcelas">Parcelas</label>
            <input id="tx-parcelas" name="parcelas" type="number" min="1" max="60" value="${t.parcela ? t.parcela.total : 1}" ${novo ? '' : 'disabled'}>
          </div>
        </div>
        ${s.cards.filter((c) => !c.deleted).length === 0 ? `<div class="aviso info" style="margin-bottom:14px"><span>💳</span><div>Nenhum cartão cadastrado ainda. <button type="button" class="btn pequeno secundario" data-acao="abrir-cartoes">Cadastrar cartão</button></div></div>` : ''}
      </div>

      ${(s.settings.pessoas || []).length ? `
      <div class="campo">
        <label>Quem lançou</label>
        <div class="opcoes">
          ${(s.settings.pessoas || []).map((p) => `<button type="button" class="opcao" data-campo="pessoa" data-valor="${escapeHTML(p)}" aria-pressed="${t.pessoa === p}">${escapeHTML(p)}</button>`).join('')}
        </div>
      </div>` : ''}

      ${s.goals.filter((g) => !g.deleted).length ? `
      <div class="campo">
        <label for="tx-meta">Vincular a uma meta (opcional)</label>
        <select id="tx-meta" name="metaId">
          <option value="">Nenhuma</option>
          ${s.goals.filter((g) => !g.deleted).map((g) => `<option value="${g.id}" ${t.metaId === g.id ? 'selected' : ''}>${g.icone || '🎯'} ${escapeHTML(g.nome)}</option>`).join('')}
        </select>
      </div>` : ''}

      <div class="switch">
        <div class="txt"><b>Já efetivado</b><span>Desligue para registrar como previsto/a pagar</span></div>
        <button type="button" class="toggle" data-campo="pago" aria-pressed="${!!t.pago}" aria-label="Já efetivado"></button>
      </div>

      ${novo ? `
      <div class="switch">
        <div class="txt"><b>Repetir todo mês</b><span>Cria também uma recorrência com esses dados</span></div>
        <button type="button" class="toggle" data-campo="repetir" aria-pressed="false" aria-label="Repetir todo mês"></button>
      </div>` : ''}

      <div class="campo" style="margin-top:14px">
        <label for="tx-obs">Observação</label>
        <textarea id="tx-obs" name="obs" placeholder="Opcional">${escapeHTML(t.obs || '')}</textarea>
      </div>

      ${!novo ? `<button type="button" class="btn perigo bloco" data-acao="excluir-lancamento" data-id="${t.id}">Excluir lançamento</button>` : ''}
    </form>`;

  const rodape = `<button class="btn principal" data-acao="salvar-lancamento">${novo ? 'Adicionar' : 'Salvar'}</button>`;

  abrirSheet({
    titulo: novo ? 'Novo lançamento' : 'Editar lançamento',
    corpo, rodape,
    aoMontar: (raiz) => {
      const form = $('#form-tx', raiz);
      form.dataset.id = t.id;
      form.dataset.tipo = t.tipo;
      form.dataset.metodo = t.metodo;
      form.dataset.pessoa = t.pessoa || '';
      form.dataset.pago = t.pago ? '1' : '';
      form.dataset.repetir = '';
      form.dataset.novo = novo ? '1' : '';
      form.dataset.recorrenciaId = t.recorrenciaId || '';
      form.dataset.grupo = t.parcela ? t.parcela.grupoId : '';
      setTimeout(() => $('#tx-valor', raiz)?.focus(), 120);
    },
  });
}

function lerFormLancamento() {
  const form = $('#form-tx');
  if (!form) return null;
  const dados = Object.fromEntries(new FormData(form).entries());
  const valor = toCents(dados.valor);
  if (!valor || valor <= 0) { toast('Informe um valor maior que zero'); return null; }
  const tx = {
    id: form.dataset.id,
    kind: 'tx',
    tipo: form.dataset.tipo,
    valor,
    data: dados.data || todayISO(),
    descricao: (dados.descricao || '').trim() || (form.dataset.tipo === 'entrada' ? 'Entrada' : 'Saída'),
    categoriaId: dados.categoriaId || null,
    metodo: form.dataset.metodo || 'pix',
    cartaoId: form.dataset.metodo === 'credito' ? (dados.cartaoId || null) : null,
    pessoa: form.dataset.pessoa || null,
    metaId: dados.metaId || null,
    pago: form.dataset.pago === '1',
    obs: (dados.obs || '').trim(),
    recorrenciaId: form.dataset.recorrenciaId || null,
    deleted: false,
  };
  return { tx, parcelas: Math.max(1, Math.min(60, Number(dados.parcelas) || 1)), novo: form.dataset.novo === '1', repetir: form.dataset.repetir === '1' };
}

function salvarLancamento() {
  const r = lerFormLancamento();
  if (!r) return;
  const { tx, parcelas, novo, repetir } = r;

  if (novo && parcelas > 1 && tx.metodo === 'credito') {
    const lista = F.gerarParcelas(tx, parcelas);
    lista.forEach((p) => S.upsert('tx', p, { silencioso: true }));
    S.notificar('tx'); S.agendarSync();
    toast(`${parcelas} parcelas registradas`);
  } else {
    const existente = st().transactions.find((x) => x.id === tx.id);
    S.upsert('tx', { ...(existente || {}), ...tx });
    toast(novo ? 'Lançamento registrado' : 'Lançamento atualizado');
  }

  if (novo && repetir) {
    S.upsert('rec', {
      id: uid(), tipo: tx.tipo, valor: tx.valor, descricao: tx.descricao,
      categoriaId: tx.categoriaId, metodo: tx.metodo, cartaoId: tx.cartaoId, pessoa: tx.pessoa,
      frequencia: 'mensal', diaMes: Number(tx.data.slice(8, 10)),
      inicio: addMonths(tx.data, 1), fim: null, ativo: true, deleted: false,
    });
    S.materializarRecorrencias();
  }

  fecharSheet();
  render();
}

/* ------------------------------------------------- sheet de recorrência */

function sheetRecorrencia(recExistente = null, preset = {}) {
  const s = st();
  const novo = !recExistente;
  const r = recExistente || {
    id: uid(), tipo: preset.tipo || ui.abaRecorrente, valor: preset.valor || 0,
    descricao: preset.descricao || '', categoriaId: preset.categoriaId || null,
    metodo: preset.metodo || 'pix', cartaoId: null, pessoa: (s.settings.pessoas || [])[0] || null,
    frequencia: 'mensal', diaMes: preset.diaMes || Number(todayISO().slice(8, 10)), diaSemana: 1, mes: 1,
    inicio: todayISO(), fim: null, ativo: true,
  };
  const cats = s.categories.filter((c) => !c.deleted);

  const corpo = `
    <form id="form-rec" novalidate>
      <div class="seg" style="margin-bottom:16px">
        <button type="button" data-campo="tipo" data-valor="saida" aria-selected="${r.tipo === 'saida'}">Saída fixa</button>
        <button type="button" data-campo="tipo" data-valor="entrada" aria-selected="${r.tipo === 'entrada'}">Entrada fixa</button>
      </div>

      <div class="campo">
        <label for="rec-desc">Descrição — loja, pessoa ou origem</label>
        <input id="rec-desc" name="descricao" value="${escapeHTML(r.descricao)}" placeholder="Ex.: Aluguel, Escola, Salário">
      </div>

      <div class="campo">
        <label for="rec-valor">Valor</label>
        <div class="valor-input ${r.tipo}"><span>R$</span>
          <input id="rec-valor" name="valor" inputmode="decimal" placeholder="0,00" value="${r.valor ? moneyPlain(r.valor) : ''}">
        </div>
        <div class="dica">Se o valor variar, use uma média — dá para editar cada mês depois.</div>
      </div>

      <div class="campo">
        <label>Frequência</label>
        <div class="opcoes">
          ${Object.entries(FREQ_ROTULO).map(([k, v]) => `<button type="button" class="opcao" data-campo="frequencia" data-valor="${k}" aria-pressed="${r.frequencia === k}">${v}</button>`).join('')}
        </div>
      </div>

      <div class="linha2">
        <div class="campo" id="campo-dia-mes">
          <label for="rec-dia">Dia do mês</label>
          <input id="rec-dia" name="diaMes" type="number" min="1" max="31" value="${r.diaMes || 1}">
        </div>
        <div class="campo">
          <label for="rec-cat">Categoria</label>
          <select id="rec-cat" name="categoriaId">
            <option value="">Sem categoria</option>
            ${cats.map((c) => `<option value="${c.id}" ${r.categoriaId === c.id ? 'selected' : ''}>${c.icone} ${escapeHTML(c.nome)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="campo">
        <label>Forma de pagamento</label>
        <div class="opcoes">
          ${F.METODOS.map((m) => `<button type="button" class="opcao" data-campo="metodo" data-valor="${m.id}" aria-pressed="${r.metodo === m.id}">${m.nome}</button>`).join('')}
        </div>
      </div>

      <div class="linha2">
        <div class="campo">
          <label for="rec-inicio">Começa em</label>
          <input id="rec-inicio" name="inicio" type="date" value="${r.inicio}">
        </div>
        <div class="campo">
          <label for="rec-fim">Termina em (opcional)</label>
          <input id="rec-fim" name="fim" type="date" value="${r.fim || ''}">
        </div>
      </div>

      <div class="switch">
        <div class="txt"><b>Ativa</b><span>Pausar deixa de projetar os próximos meses</span></div>
        <button type="button" class="toggle" data-campo="ativo" aria-pressed="${r.ativo !== false}" aria-label="Ativa"></button>
      </div>

      ${!novo ? `<button type="button" class="btn perigo bloco" style="margin-top:16px" data-acao="excluir-recorrencia" data-id="${r.id}">Excluir recorrência</button>` : ''}
    </form>`;

  abrirSheet({
    titulo: novo ? 'Nova recorrência' : 'Editar recorrência',
    corpo,
    rodape: `<button class="btn principal" data-acao="salvar-recorrencia">${novo ? 'Cadastrar' : 'Salvar'}</button>`,
    aoMontar: (raiz) => {
      const form = $('#form-rec', raiz);
      form.dataset.id = r.id;
      form.dataset.tipo = r.tipo;
      form.dataset.metodo = r.metodo;
      form.dataset.frequencia = r.frequencia;
      form.dataset.ativo = r.ativo !== false ? '1' : '';
      form.dataset.novo = novo ? '1' : '';
    },
  });
}

function salvarRecorrencia() {
  const form = $('#form-rec');
  if (!form) return;
  const d = Object.fromEntries(new FormData(form).entries());
  const valor = toCents(d.valor);
  if (!valor || valor <= 0) { toast('Informe um valor maior que zero'); return; }
  if (!(d.descricao || '').trim()) { toast('Dê um nome à recorrência'); return; }

  const antiga = st().recurrences.find((x) => x.id === form.dataset.id);
  const rec = {
    ...(antiga || {}),
    id: form.dataset.id,
    tipo: form.dataset.tipo,
    valor,
    descricao: d.descricao.trim(),
    categoriaId: d.categoriaId || null,
    metodo: form.dataset.metodo,
    frequencia: form.dataset.frequencia || 'mensal',
    diaMes: Math.max(1, Math.min(31, Number(d.diaMes) || 1)),
    inicio: d.inicio || todayISO(),
    fim: d.fim || null,
    ativo: form.dataset.ativo === '1',
    deleted: false,
  };
  S.upsert('rec', rec);

  // remove projeções futuras não efetivadas para regerar com os novos dados
  const hoje = todayISO();
  for (const t of st().transactions) {
    if (t.recorrenciaId === rec.id && !t.pago && t.data >= hoje && !t.deleted) {
      S.upsert('tx', { ...t, deleted: true }, { silencioso: true });
    }
  }
  S.materializarRecorrencias();
  fecharSheet();
  render();
  toast('Recorrência salva');
}

/* -------------------------------------------------------- categorias */

function sheetCategorias() {
  const s = st();
  const listar = (tipo) => s.categories.filter((c) => !c.deleted && c.tipo === tipo)
    .map((c) => `
      <button class="item" data-acao="editar-categoria" data-id="${c.id}">
        <span class="ic" style="background:${c.cor}1f">${c.icone || '•'}</span>
        <span class="corpo"><span class="t">${escapeHTML(c.nome)}</span>
        <span class="s">${c.orcamento > 0 ? `orçamento ${money(c.orcamento)}/mês` : 'sem orçamento definido'}</span></span>
        <span style="color:var(--ink-3)">›</span>
      </button>`).join('');

  abrirSheet({
    titulo: 'Categorias e orçamento',
    corpo: `
      <div class="aviso info" style="margin-bottom:14px"><span>💡</span><div>Definir um orçamento mensal faz a categoria aparecer no painel com barra de consumo e alerta de estouro.</div></div>
      <div class="lista-titulo">Saídas</div>${listar('saida')}
      <div class="lista-titulo">Entradas</div>${listar('entrada')}`,
    rodape: `<button class="btn principal" data-acao="nova-categoria">Nova categoria</button>`,
  });
}

function sheetCategoria(c = null) {
  const novo = !c;
  const cor = c?.cor || S.PALETA[0];
  c = c || { id: uid(), nome: '', icone: '🏷️', tipo: 'saida', cor, orcamento: 0 };
  abrirSheet({
    titulo: novo ? 'Nova categoria' : 'Editar categoria',
    corpo: `
      <form id="form-cat">
        <div class="seg" style="margin-bottom:16px">
          <button type="button" data-campo="tipo" data-valor="saida" aria-selected="${c.tipo === 'saida'}">Saída</button>
          <button type="button" data-campo="tipo" data-valor="entrada" aria-selected="${c.tipo === 'entrada'}">Entrada</button>
        </div>
        <div class="linha2">
          <div class="campo"><label for="cat-ic">Ícone</label><input id="cat-ic" name="icone" value="${escapeHTML(c.icone || '')}" maxlength="4"></div>
          <div class="campo"><label for="cat-nome">Nome</label><input id="cat-nome" name="nome" value="${escapeHTML(c.nome)}"></div>
        </div>
        <div class="campo">
          <label for="cat-orc">Orçamento mensal (opcional)</label>
          <div class="valor-input"><span>R$</span><input id="cat-orc" name="orcamento" inputmode="decimal" value="${c.orcamento ? moneyPlain(c.orcamento) : ''}" placeholder="0,00"></div>
        </div>
        <div class="campo">
          <label>Cor</label>
          <div class="opcoes">
            ${S.PALETA.map((p) => `<button type="button" class="opcao" data-campo="cor" data-valor="${p}" aria-pressed="${c.cor === p}" style="padding:0;width:38px;height:38px;justify-content:center">
              <i style="width:18px;height:18px;border-radius:6px;background:${p};display:block"></i></button>`).join('')}
          </div>
        </div>
        ${novo ? '' : `<button type="button" class="btn perigo bloco" data-acao="excluir-categoria" data-id="${c.id}">Excluir categoria</button>`}
      </form>`,
    rodape: `<button class="btn principal" data-acao="salvar-categoria">Salvar</button>`,
    aoMontar: (raiz) => {
      const f = $('#form-cat', raiz);
      f.dataset.id = c.id; f.dataset.tipo = c.tipo; f.dataset.cor = c.cor;
    },
  });
}

/* ------------------------------------------------------------ cartões */

function sheetCartoes() {
  const s = st();
  const lista = s.cards.filter((c) => !c.deleted);
  abrirSheet({
    titulo: 'Cartões de crédito',
    corpo: lista.length ? lista.map((c) => {
      const fs = F.faturas(s, todayISO(), addDays(todayISO(), 60)).filter((f) => f.cartaoId === c.id);
      const aberta = fs[0];
      return `
        <button class="item" data-acao="editar-cartao" data-id="${c.id}">
          <span class="ic" style="background:${c.cor}22">💳</span>
          <span class="corpo"><span class="t">${escapeHTML(c.nome)}</span>
          <span class="s">fecha dia ${c.diaFechamento} · vence dia ${c.diaVencimento}${aberta ? ` · próxima fatura ${money(aberta.total)}` : ''}</span></span>
          <span style="color:var(--ink-3)">›</span>
        </button>`;
    }).join('') : `<div class="vazio"><span class="emoji">💳</span><b>Nenhum cartão cadastrado</b><p>Cadastre para acompanhar fatura, fechamento e parcelas.</p></div>`,
    rodape: `<button class="btn principal" data-acao="novo-cartao">Novo cartão</button>`,
  });
}

function sheetCartao(c = null) {
  const novo = !c;
  c = c || { id: uid(), nome: '', limite: 0, diaFechamento: 25, diaVencimento: 5, cor: S.PALETA[0] };
  abrirSheet({
    titulo: novo ? 'Novo cartão' : 'Editar cartão',
    corpo: `
      <form id="form-card">
        <div class="campo"><label for="cd-nome">Nome do cartão</label><input id="cd-nome" name="nome" value="${escapeHTML(c.nome)}" placeholder="Ex.: Nubank Athos"></div>
        <div class="linha2">
          <div class="campo"><label for="cd-fech">Fecha no dia</label><input id="cd-fech" name="diaFechamento" type="number" min="1" max="31" value="${c.diaFechamento}"></div>
          <div class="campo"><label for="cd-venc">Vence no dia</label><input id="cd-venc" name="diaVencimento" type="number" min="1" max="31" value="${c.diaVencimento}"></div>
        </div>
        <div class="campo"><label for="cd-lim">Limite (opcional)</label>
          <div class="valor-input"><span>R$</span><input id="cd-lim" name="limite" inputmode="decimal" value="${c.limite ? moneyPlain(c.limite) : ''}" placeholder="0,00"></div>
        </div>
        <div class="campo"><label>Cor</label>
          <div class="opcoes">${S.PALETA.map((p) => `<button type="button" class="opcao" data-campo="cor" data-valor="${p}" aria-pressed="${c.cor === p}" style="padding:0;width:38px;height:38px;justify-content:center"><i style="width:18px;height:18px;border-radius:6px;background:${p};display:block"></i></button>`).join('')}</div>
        </div>
        <div class="aviso info"><span>ℹ️</span><div>Compras no crédito não saem do caixa na hora: elas entram na fatura e viram uma saída prevista na data de vencimento.</div></div>
        ${novo ? '' : `<button type="button" class="btn perigo bloco" style="margin-top:14px" data-acao="excluir-cartao" data-id="${c.id}">Excluir cartão</button>`}
      </form>`,
    rodape: `<button class="btn principal" data-acao="salvar-cartao">Salvar</button>`,
    aoMontar: (raiz) => { const f = $('#form-card', raiz); f.dataset.id = c.id; f.dataset.cor = c.cor; },
  });
}

function sheetFatura(id) {
  const s = st();
  const f = F.faturas(s, null, null).find((x) => x.id === id);
  if (!f) return;
  abrirSheet({
    titulo: `Fatura ${f.cartao}`,
    corpo: `
      <div class="hero" style="margin-bottom:14px">
        <div class="rot">Total da fatura</div>
        <div class="valor tabular">${money(f.total)}</div>
        <div class="nota">Fecha ${dateLabelFull(f.dataFechamento)} · vence ${dateLabelFull(f.dataVencimento)}</div>
      </div>
      <div class="switch">
        <div class="txt"><b>Fatura paga</b><span>Marcar retira a saída prevista do fluxo</span></div>
        <button type="button" class="toggle" data-acao="alternar-fatura" data-id="${f.id}" aria-pressed="${!!f.pago}"></button>
      </div>
      <div class="lista-titulo">Compras (${f.itens.length})</div>
      ${f.itens.sort((a, b) => a.data.localeCompare(b.data)).map((t) => itemLancamento(t, { mostrarData: true })).join('')}`,
  });
}

/* -------------------------------------------------------------- metas */

function sheetMetas() {
  const metas = F.progressoMetas(st());
  abrirSheet({
    titulo: 'Metas e reserva',
    corpo: metas.length
      ? `<div class="card plano" style="border:0;padding:0">${metas.map((m) => blocoMeta(m)).join('<div style="height:16px"></div>')}</div>`
      : `<div class="vazio"><span class="emoji">🎯</span><b>Nenhuma meta ainda</b><p>Reserva de emergência, viagem, entrada do imóvel: defina o alvo e acompanhe o progresso.</p></div>`,
    rodape: `<button class="btn principal" data-acao="nova-meta">Nova meta</button>`,
  });
}

function sheetMeta(g = null) {
  const novo = !g;
  const media = F.mediaMensal(st(), monthKey(todayISO()), 3);
  g = g || { id: uid(), nome: '', icone: '🎯', alvo: 0, saldoInicial: 0, prazo: '', cor: S.PALETA[2] };
  abrirSheet({
    titulo: novo ? 'Nova meta' : 'Editar meta',
    corpo: `
      <form id="form-meta">
        <div class="linha2">
          <div class="campo"><label for="mt-ic">Ícone</label><input id="mt-ic" name="icone" value="${escapeHTML(g.icone || '🎯')}" maxlength="4"></div>
          <div class="campo"><label for="mt-nome">Nome</label><input id="mt-nome" name="nome" value="${escapeHTML(g.nome)}" placeholder="Reserva de emergência"></div>
        </div>
        <div class="campo"><label for="mt-alvo">Quanto quer juntar</label>
          <div class="valor-input"><span>R$</span><input id="mt-alvo" name="alvo" inputmode="decimal" value="${g.alvo ? moneyPlain(g.alvo) : ''}" placeholder="0,00"></div>
          ${media.saidas > 0 ? `<div class="dica">Sugestão de reserva: ${money(media.saidas * (st().settings.reservaAlvoMeses || 6))} (${st().settings.reservaAlvoMeses || 6} meses do custo médio).</div>` : ''}
        </div>
        <div class="linha2">
          <div class="campo"><label for="mt-inicial">Já guardado hoje</label>
            <div class="valor-input"><span>R$</span><input id="mt-inicial" name="saldoInicial" inputmode="decimal" value="${g.saldoInicial ? moneyPlain(g.saldoInicial) : ''}" placeholder="0,00"></div>
          </div>
          <div class="campo"><label for="mt-prazo">Prazo (opcional)</label><input id="mt-prazo" name="prazo" type="date" value="${g.prazo || ''}"></div>
        </div>
        <div class="campo"><label>Cor</label>
          <div class="opcoes">${S.PALETA.map((p) => `<button type="button" class="opcao" data-campo="cor" data-valor="${p}" aria-pressed="${g.cor === p}" style="padding:0;width:38px;height:38px;justify-content:center"><i style="width:18px;height:18px;border-radius:6px;background:${p};display:block"></i></button>`).join('')}</div>
        </div>
        <div class="aviso info"><span>💡</span><div>Para registrar um aporte, crie um lançamento de saída e escolha esta meta no campo “vincular a uma meta”.</div></div>
        ${novo ? '' : `<button type="button" class="btn perigo bloco" style="margin-top:14px" data-acao="excluir-meta" data-id="${g.id}">Excluir meta</button>`}
      </form>`,
    rodape: `<button class="btn principal" data-acao="salvar-meta">Salvar</button>`,
    aoMontar: (raiz) => { const f = $('#form-meta', raiz); f.dataset.id = g.id; f.dataset.cor = g.cor; },
  });
}

/* ------------------------------------------------------- configurações */

function sheetSaldoInicial() {
  const s = st();
  abrirSheet({
    titulo: 'Saldo inicial',
    corpo: `
      <form id="form-saldo">
        <div class="aviso info" style="margin-bottom:14px"><span>🏦</span><div>Some o que vocês têm hoje em conta corrente, poupança e dinheiro. É o ponto de partida das projeções.</div></div>
        <div class="campo"><label for="sl-valor">Saldo disponível hoje</label>
          <div class="valor-input"><span>R$</span><input id="sl-valor" name="saldoInicial" inputmode="decimal" value="${s.settings.saldoInicial ? moneyPlain(s.settings.saldoInicial) : ''}" placeholder="0,00"></div>
        </div>
        <div class="campo"><label for="sl-data">Data desse saldo</label><input id="sl-data" name="saldoInicialData" type="date" value="${s.settings.saldoInicialData}"></div>
      </form>`,
    rodape: `<button class="btn principal" data-acao="salvar-saldo">Salvar</button>`,
  });
}

function sheetAjustes() {
  const s = st();
  abrirSheet({
    titulo: 'Ajustes',
    corpo: `
      <form id="form-ajustes">
        <div class="campo"><label for="aj-lar">Nome da casa</label><input id="aj-lar" name="lar" value="${escapeHTML(s.settings.lar || '')}"></div>
        <div class="campo"><label for="aj-pessoas">Pessoas (separadas por vírgula)</label>
          <input id="aj-pessoas" name="pessoas" value="${escapeHTML((s.settings.pessoas || []).join(', '))}" placeholder="Eu, Esposa">
          <div class="dica">Usado para marcar quem fez cada lançamento.</div>
        </div>
        <div class="linha2">
          <div class="campo"><label for="aj-reserva">Reserva alvo (meses de custo)</label><input id="aj-reserva" name="reservaAlvoMeses" type="number" min="1" max="24" value="${s.settings.reservaAlvoMeses || 6}"></div>
          <div class="campo"><label for="aj-horizonte">Projetar quantos meses à frente</label><input id="aj-horizonte" name="horizonteMeses" type="number" min="1" max="12" value="${s.settings.horizonteMeses || 3}"></div>
        </div>
        <div class="campo"><label>Tema</label>
          <div class="seg">
            ${[['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']].map(([v, r]) =>
              `<button type="button" data-campo="tema" data-valor="${v}" aria-selected="${(s.settings.tema || 'auto') === v}">${r}</button>`).join('')}
          </div>
        </div>
      </form>`,
    rodape: `<button class="btn principal" data-acao="salvar-ajustes">Salvar</button>`,
    aoMontar: (raiz) => { $('#form-ajustes', raiz).dataset.tema = s.settings.tema || 'auto'; },
  });
}

function sheetSync() {
  const cfg = S.sync.config || {};
  const est = S.sync.estadoAtual;
  abrirSheet({
    titulo: 'Sincronizar entre celulares',
    corpo: `
      <div class="badge-sync ${est}" style="margin-bottom:12px"><i></i>${escapeHTML(S.sync.mensagem || { desligado: 'Desligado — os dados ficam só neste aparelho', conectando: 'Conectando…', ok: 'Conectado', erro: 'Erro' }[est])}</div>
      <div class="aviso info" style="margin-bottom:14px"><span>☁️</span><div>Crie um projeto gratuito no <b>Supabase</b>, rode o script que está no arquivo <b>COMO-PUBLICAR.md</b> e informe os dados abaixo nos dois celulares, usando o mesmo e-mail e senha.</div></div>
      <form id="form-sync">
        <div class="campo"><label for="sy-url">URL do projeto</label><input id="sy-url" name="url" type="url" value="${escapeHTML(cfg.url || '')}" placeholder="https://xxxx.supabase.co" autocomplete="off"></div>
        <div class="campo"><label for="sy-chave">Chave pública (anon)</label><input id="sy-chave" name="chave" value="${escapeHTML(cfg.chave || '')}" placeholder="eyJhbGciOi..." autocomplete="off"></div>
        <div class="campo"><label for="sy-email">E-mail do casal</label><input id="sy-email" name="email" type="email" value="${escapeHTML(cfg.email || '')}" autocomplete="off"></div>
        <div class="campo"><label for="sy-senha">Senha</label><input id="sy-senha" name="senha" type="password" value="${escapeHTML(cfg.senha || '')}" autocomplete="off"></div>
      </form>
      ${est === 'ok' ? `<button class="btn secundario bloco" style="margin-bottom:10px" data-acao="sincronizar-agora">Sincronizar agora</button>
        <button class="btn perigo bloco" data-acao="desconectar-sync">Desconectar deste aparelho</button>` : ''}`,
    rodape: `<button class="btn principal" data-acao="conectar-sync">${est === 'ok' ? 'Atualizar conexão' : 'Conectar'}</button>`,
  });
}

/* =====================================================================
   Ações
   ===================================================================== */

const acoes = {
  ir: (el) => { ui.rota = el.dataset.rota; if (el.dataset.status) ui.filtroStatus = el.dataset.status; render(); window.scrollTo(0, 0); },
  mes: (el) => { ui.mes = monthAdd(ui.mes, Number(el.dataset.delta)); render(); },
  'filtro-tipo': (el) => { ui.filtroTipo = el.dataset.valor; render(); },
  'filtro-status': (el) => { ui.filtroStatus = el.dataset.valor; render(); },
  'aba-recorrente': (el) => { ui.abaRecorrente = el.dataset.valor; render(); },

  'novo-lancamento': () => sheetLancamento(),
  'editar-lancamento': (el) => {
    const t = st().transactions.find((x) => x.id === el.dataset.id);
    if (t) sheetLancamento(t);
  },
  'salvar-lancamento': salvarLancamento,
  'excluir-lancamento': (el) => {
    if (!confirm('Excluir este lançamento?')) return;
    S.remover('tx', el.dataset.id);
    fecharSheet(); render(); toast('Lançamento excluído');
  },

  'nova-recorrencia': () => sheetRecorrencia(),
  'editar-recorrencia': (el) => {
    const r = st().recurrences.find((x) => x.id === el.dataset.id);
    if (r) sheetRecorrencia(r);
  },
  'salvar-recorrencia': salvarRecorrencia,
  'excluir-recorrencia': (el) => {
    if (!confirm('Excluir a recorrência? Os lançamentos previstos futuros também saem.')) return;
    const id = el.dataset.id;
    const hoje = todayISO();
    for (const t of st().transactions) {
      if (t.recorrenciaId === id && !t.pago && t.data >= hoje && !t.deleted) S.upsert('tx', { ...t, deleted: true }, { silencioso: true });
    }
    S.remover('rec', id);
    fecharSheet(); render(); toast('Recorrência excluída');
  },
  'criar-recorrencia-sugerida': (el) => {
    const sg = F.sugestoesRecorrencia(st()).find((x) => x.chave === el.dataset.chave);
    if (!sg) return;
    sheetRecorrencia(null, {
      tipo: sg.tipo, valor: sg.valorMediano, descricao: sg.descricao,
      categoriaId: sg.categoriaId, metodo: sg.metodo, diaMes: sg.diaTipico,
    });
  },

  'abrir-categorias': sheetCategorias,
  'nova-categoria': () => sheetCategoria(),
  'editar-categoria': (el) => sheetCategoria(st().categories.find((c) => c.id === el.dataset.id)),
  'salvar-categoria': () => {
    const f = $('#form-cat');
    const d = Object.fromEntries(new FormData(f).entries());
    if (!d.nome.trim()) { toast('Informe o nome'); return; }
    const antiga = st().categories.find((c) => c.id === f.dataset.id);
    S.upsert('cat', {
      ...(antiga || {}), id: f.dataset.id, nome: d.nome.trim(), icone: d.icone || '🏷️',
      tipo: f.dataset.tipo, cor: f.dataset.cor, orcamento: toCents(d.orcamento), deleted: false,
    });
    fecharSheet(); render(); toast('Categoria salva');
  },
  'excluir-categoria': (el) => {
    if (!confirm('Excluir a categoria? Os lançamentos ficam sem categoria.')) return;
    S.remover('cat', el.dataset.id); fecharSheet(); render();
  },

  'abrir-cartoes': sheetCartoes,
  'novo-cartao': () => sheetCartao(),
  'editar-cartao': (el) => sheetCartao(st().cards.find((c) => c.id === el.dataset.id)),
  'salvar-cartao': () => {
    const f = $('#form-card');
    const d = Object.fromEntries(new FormData(f).entries());
    if (!d.nome.trim()) { toast('Informe o nome do cartão'); return; }
    const antigo = st().cards.find((c) => c.id === f.dataset.id);
    S.upsert('card', {
      ...(antigo || {}), id: f.dataset.id, nome: d.nome.trim(), cor: f.dataset.cor,
      diaFechamento: Math.max(1, Math.min(31, Number(d.diaFechamento) || 1)),
      diaVencimento: Math.max(1, Math.min(31, Number(d.diaVencimento) || 10)),
      limite: toCents(d.limite), deleted: false,
    });
    fecharSheet(); render(); toast('Cartão salvo');
  },
  'excluir-cartao': (el) => {
    if (!confirm('Excluir o cartão? As compras lançadas continuam registradas.')) return;
    S.remover('card', el.dataset.id); fecharSheet(); render();
  },
  'ver-fatura': (el) => sheetFatura(el.dataset.id),
  'alternar-fatura': (el) => {
    const id = el.dataset.id;
    const atual = st().invoices.find((i) => i.id === id);
    const pago = !(atual && atual.pago);
    S.upsert('fatura', { ...(atual || {}), id, pago, pagoEm: pago ? todayISO() : null, deleted: false });
    el.setAttribute('aria-pressed', String(pago));
    render();
    toast(pago ? 'Fatura marcada como paga' : 'Fatura reaberta');
  },

  'abrir-metas': sheetMetas,
  'nova-meta': () => sheetMeta(),
  'editar-meta': (el) => sheetMeta(st().goals.find((g) => g.id === el.dataset.id)),
  'salvar-meta': () => {
    const f = $('#form-meta');
    const d = Object.fromEntries(new FormData(f).entries());
    if (!d.nome.trim()) { toast('Informe o nome da meta'); return; }
    const antiga = st().goals.find((g) => g.id === f.dataset.id);
    S.upsert('goal', {
      ...(antiga || {}), id: f.dataset.id, nome: d.nome.trim(), icone: d.icone || '🎯',
      alvo: toCents(d.alvo), saldoInicial: toCents(d.saldoInicial), prazo: d.prazo || null,
      cor: f.dataset.cor, deleted: false,
    });
    fecharSheet(); render(); toast('Meta salva');
  },
  'excluir-meta': (el) => {
    if (!confirm('Excluir esta meta?')) return;
    S.remover('goal', el.dataset.id); fecharSheet(); render();
  },

  'abrir-saldo-inicial': sheetSaldoInicial,
  'salvar-saldo': () => {
    const d = Object.fromEntries(new FormData($('#form-saldo')).entries());
    S.atualizarSettings({ saldoInicial: toCents(d.saldoInicial), saldoInicialData: d.saldoInicialData || todayISO() });
    fecharSheet(); render(); toast('Saldo inicial atualizado');
  },
  'abrir-ajustes': sheetAjustes,
  'salvar-ajustes': () => {
    const f = $('#form-ajustes');
    const d = Object.fromEntries(new FormData(f).entries());
    S.atualizarSettings({
      lar: d.lar.trim() || 'Nossa casa',
      pessoas: d.pessoas.split(',').map((x) => x.trim()).filter(Boolean),
      reservaAlvoMeses: Math.max(1, Number(d.reservaAlvoMeses) || 6),
      horizonteMeses: Math.max(1, Math.min(12, Number(d.horizonteMeses) || 3)),
      tema: f.dataset.tema || 'auto',
    });
    aplicarTema();
    S.materializarRecorrencias();
    fecharSheet(); render(); toast('Ajustes salvos');
  },

  'abrir-sync': sheetSync,
  'conectar-sync': async (el) => {
    const d = Object.fromEntries(new FormData($('#form-sync')).entries());
    if (!d.url || !d.chave || !d.email || !d.senha) { toast('Preencha todos os campos'); return; }
    el.disabled = true; el.textContent = 'Conectando…';
    const ok = await S.conectarSync({ url: d.url.trim(), chave: d.chave.trim(), email: d.email.trim(), senha: d.senha });
    el.disabled = false;
    if (ok) { fecharSheet(); render(); toast('Sincronização ligada'); }
    else { toast(S.sync.mensagem || 'Não foi possível conectar'); sheetSync(); }
  },
  'sincronizar-agora': async () => { await S.sincronizar({ forcarTudo: true }); render(); toast(S.sync.mensagem); },
  'desconectar-sync': async () => { await S.desconectarSync(); fecharSheet(); render(); toast('Sincronização desligada'); },

  'exportar-csv': () => baixar('lancamentos.csv', S.exportarCSV(), 'text/csv;charset=utf-8'),
  'exportar-json': () => baixar(`backup-financas-${todayISO()}.json`, S.exportarJSON(), 'application/json'),
  'importar-json': () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = async () => {
      const arq = inp.files?.[0];
      if (!arq) return;
      if (!confirm('Restaurar o backup substitui todos os dados deste aparelho. Continuar?')) return;
      try { S.importarJSON(await arq.text()); render(); toast('Backup restaurado'); }
      catch (e) { toast('Arquivo inválido'); }
    };
    inp.click();
  },

  'fechar-sheet': fecharSheet,
};

function baixar(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast('Arquivo gerado');
}

/* =====================================================================
   Eventos globais
   ===================================================================== */

document.addEventListener('click', (ev) => {
  const campo = ev.target.closest('[data-campo]');
  if (campo) {
    const form = campo.closest('form');
    const nome = campo.dataset.campo;
    if (campo.classList.contains('toggle')) {
      const novo = campo.getAttribute('aria-pressed') !== 'true';
      campo.setAttribute('aria-pressed', String(novo));
      if (form) form.dataset[nome] = novo ? '1' : '';
      if (nome === 'ativo' || nome === 'pago' || nome === 'repetir') return;
      return;
    }
    const grupo = campo.parentElement.querySelectorAll(`[data-campo="${nome}"]`);
    grupo.forEach((b) => {
      const sel = b === campo;
      if (b.hasAttribute('aria-selected')) b.setAttribute('aria-selected', String(sel));
      else b.setAttribute('aria-pressed', String(sel));
    });
    if (form) form.dataset[nome] = campo.dataset.valor;
    reagirCampo(nome, campo.dataset.valor, form);
    return;
  }

  const el = ev.target.closest('[data-acao]');
  if (!el) return;
  const fn = acoes[el.dataset.acao];
  if (fn) { ev.preventDefault(); fn(el, ev); }
});

document.addEventListener('input', (ev) => {
  if (ev.target.matches('[data-acao="busca"]')) {
    ui.busca = ev.target.value;
    const pos = ev.target.selectionStart;
    clearTimeout(document._buscaT);
    document._buscaT = setTimeout(() => {
      render();
      const novo = $('[data-acao="busca"]');
      if (novo) { novo.focus(); novo.setSelectionRange(pos, pos); }
    }, 260);
  }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && sheetAberta) fecharSheet();
});

function reagirCampo(nome, valor, form) {
  if (nome === 'tipo') {
    $$('.valor-input').forEach((v) => { v.classList.remove('entrada', 'saida'); v.classList.add(valor); });
    const sel = $('#tx-cat') || $('#rec-cat');
    if (sel) {
      [...sel.options].forEach((o) => {
        if (!o.value) return;
        const c = cat(o.value);
        o.hidden = c && c.tipo !== valor;
      });
      const atual = cat(sel.value);
      if (atual && atual.tipo !== valor) sel.value = '';
    }
  }
  if (nome === 'metodo') {
    const bloco = $('#bloco-cartao');
    if (bloco) bloco.hidden = valor !== 'credito';
  }
  if (nome === 'frequencia') {
    const campoDia = $('#campo-dia-mes');
    if (campoDia) campoDia.style.display = (valor === 'mensal' || valor === 'anual') ? '' : 'none';
  }
}

/* =====================================================================
   Render
   ===================================================================== */

const telas = { inicio: telaInicio, lancamentos: telaLancamentos, fluxo: telaFluxo, recorrentes: telaRecorrentes, mais: telaMais };

const ABAS = [
  ['inicio', 'Início', ICO.inicio],
  ['lancamentos', 'Lançamentos', ICO.lista],
  ['fluxo', 'Fluxo', ICO.fluxo],
  ['recorrentes', 'Fixos', ICO.repetir],
  ['mais', 'Mais', ICO.mais],
];

function render() {
  const main = $('main');
  main.innerHTML = telas[ui.rota]();
  $('#nav').innerHTML = ABAS.map(([id, rot, ic]) =>
    `<button data-acao="ir" data-rota="${id}" ${ui.rota === id ? 'aria-current="page"' : ''}>${svg(ic)}<span>${rot}</span></button>`).join('');
  desenharGraficos();
}

function desenharGraficos() {
  const s = st();
  const alvoSemanas = $('#viz-semanas');
  if (alvoSemanas) {
    const semanas = F.provisaoSemanal(s, { semanas: 5 });
    graficoDivergente(alvoSemanas, semanas.map((w) => ({
      rotulo: w.atual ? 'Agora' : dateLabel(w.inicio).replace(' ', '/'),
      sub: `${dateLabel(w.inicio)} a ${dateLabel(w.fim)}`,
      entradas: w.entradas, saidas: w.saidas, saldo: w.saldoFim, destaque: w.atual,
    })), { descricao: 'Entradas e saídas previstas por semana' });
  }

  const alvoFluxo = $('#viz-fluxo');
  if (alvoFluxo) {
    const mkHoje = monthKey(todayISO());
    const serie = F.fluxoCaixa(s, monthAdd(mkHoje, -(ui.fluxoJanela - 1)), monthAdd(mkHoje, 3));
    graficoDivergente(alvoFluxo, serie.map((m) => ({
      rotulo: monthLabel(m.mk).split('/')[0], sub: monthLabelLong(m.mk),
      entradas: m.entradas, saidas: m.saidas, saldo: m.saldoFim, destaque: m.mk === mkHoje,
    })), { descricao: 'Entradas e saídas por mês', alturaMax: 240, rotuloSaldo: false });

    const alvoSaldo = $('#viz-saldo');
    if (alvoSaldo) {
      graficoLinha(alvoSaldo, serie.map((m) => ({ rotulo: monthLabel(m.mk).split('/')[0], valor: m.saldoFim })),
        { descricao: 'Saldo acumulado projetado' });
    }
  }

  const alvoCat = $('#viz-categorias');
  if (alvoCat) {
    const comp = F.orcamentoMes(s, ui.mes).filter((o) => o.gasto > 0).slice(0, 8);
    graficoBarrasH(alvoCat, comp.map((o) => ({
      rotulo: o.categoria.nome, icone: o.categoria.icone, valor: o.gasto, cor: o.categoria.cor,
    })));
  }
}

let redimensionar;
window.addEventListener('resize', () => {
  clearTimeout(redimensionar);
  redimensionar = setTimeout(desenharGraficos, 200);
});

function aplicarTema() {
  const t = st().settings.tema || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.setAttribute('data-tema', t);
  const cor = getComputedStyle(document.body).getPropertyValue('background-color');
  $('meta[name="theme-color"]')?.setAttribute('content', cor.trim() || '#ffffff');
}

/* =====================================================================
   Boot
   ===================================================================== */

export function iniciar() {
  S.carregar();
  aplicarTema();
  S.materializarRecorrencias();
  render();

  S.assinar((_, motivo) => {
    if (motivo === 'sync-dados' || motivo === 'recarga') { aplicarTema(); render(); }
    if (motivo === 'sync') {
      const badge = $('#badge-sync');
      if (badge) badge.className = 'badge-sync ' + S.sync.estadoAtual;
    }
  });

  S.iniciarSyncSalvo();

  // atalhos do ícone na tela inicial (manifest shortcuts)
  const atalho = new URLSearchParams(location.search).get('acao');
  if (atalho === 'saida' || atalho === 'entrada') {
    history.replaceState(null, '', location.pathname);
    sheetLancamento(null, { tipo: atalho });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.sync.estadoAtual === 'ok') S.sincronizar();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
