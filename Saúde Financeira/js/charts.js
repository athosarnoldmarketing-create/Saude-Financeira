// charts.js — gráficos em SVG puro, sem dependências externas.
// Regras seguidas: um eixo só, marcas finas, extremidade arredondada de 4px
// ancorada na linha de base, folga de 2px entre barras, legenda sempre que
// houver 2+ séries, rótulos diretos e tooltip no toque/hover.
import { escapeHTML, moneyShort, money } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (nome, attrs = {}) => {
  const n = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  return n;
};

function tooltipDe(container) {
  let tip = container.querySelector('.viz-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'viz-tip';
    tip.hidden = true;
    container.appendChild(tip);
  }
  return tip;
}

function ligarTooltip(container, alvo, html) {
  const tip = tooltipDe(container);
  const mostrar = (ev) => {
    tip.innerHTML = html;
    tip.hidden = false;
    const r = container.getBoundingClientRect();
    const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    const y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
    tip.style.left = Math.max(8, Math.min(r.width - tip.offsetWidth - 8, x - tip.offsetWidth / 2)) + 'px';
    tip.style.top = Math.max(4, y - tip.offsetHeight - 14) + 'px';
  };
  const esconder = () => { tip.hidden = true; };
  alvo.addEventListener('pointerenter', mostrar);
  alvo.addEventListener('pointermove', mostrar);
  alvo.addEventListener('pointerleave', esconder);
  alvo.addEventListener('pointerdown', mostrar);
}

/** Retângulo com as pontas de cima arredondadas (4px) e base reta. */
function barraPath(x, y, w, h, r = 4) {
  const rr = Math.min(r, w / 2, Math.max(0, h));
  if (h <= 0.5) return `M${x} ${y}h${w}`;
  return `M${x} ${y + h} L${x} ${y + rr} Q${x} ${y} ${x + rr} ${y} L${x + w - rr} ${y} Q${x + w} ${y} ${x + w} ${y + rr} L${x + w} ${y + h} Z`;
}
function barraPathBaixo(x, y, w, h, r = 4) {
  const rr = Math.min(r, w / 2, Math.max(0, h));
  if (h <= 0.5) return `M${x} ${y}h${w}`;
  return `M${x} ${y} L${x} ${y + h - rr} Q${x} ${y + h} ${x + rr} ${y + h} L${x + w - rr} ${y + h} Q${x + w} ${y + h} ${x + w} ${y + h - rr} L${x + w} ${y} Z`;
}

/**
 * Colunas divergentes: entradas para cima, saídas para baixo, base comum.
 * dados: [{ rotulo, sub, entradas, saidas, saldo, destaque }]
 */
export function graficoDivergente(container, dados, opcoes = {}) {
  const { alturaMax = 220 } = opcoes;
  // com muitas colunas não cabe rótulo de saldo sob cada uma sem colidir
  const rotuloSaldo = opcoes.rotuloSaldo != null ? opcoes.rotuloSaldo : dados.length <= 6;
  container.classList.add('viz');
  container.querySelectorAll('svg').forEach((s) => s.remove());
  if (!dados.length) return;

  const w = Math.max(280, container.clientWidth || 320);
  const h = Math.min(alturaMax, Math.max(170, Math.round(w * 0.52)));
  const padTop = 22, padBottom = rotuloSaldo ? 44 : 28;
  const alturaUtil = h - padTop - padBottom;
  const meio = padTop + alturaUtil / 2;
  const passo = w / dados.length;
  const larguraBarra = Math.max(7, Math.min(22, passo / 2 - 4));
  const gap = 2;

  const max = Math.max(1, ...dados.map((d) => Math.max(d.entradas, d.saidas)));
  const escala = (v) => (v / max) * (alturaUtil / 2 - 6);

  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: 'img' });
  svg.setAttribute('aria-label', opcoes.descricao || 'Gráfico de entradas e saídas por período');

  // linha de base
  svg.appendChild(el('line', { x1: 0, x2: w, y1: meio, y2: meio, stroke: 'var(--viz-base)', 'stroke-width': 1 }));

  dados.forEach((d, i) => {
    const cx = i * passo + passo / 2;
    if (d.destaque) {
      svg.appendChild(el('rect', {
        x: i * passo + 1, y: padTop - 16, width: passo - 2, height: alturaUtil + 32,
        rx: 8, fill: 'var(--viz-destaque)',
      }));
    }

    const hE = escala(d.entradas), hS = escala(d.saidas);
    const xE = cx - larguraBarra - gap / 2, xS = cx + gap / 2;

    const pE = el('path', { d: barraPath(xE, meio - hE, larguraBarra, hE), fill: 'var(--serie-entrada)' });
    const pS = el('path', { d: barraPathBaixo(xS, meio, larguraBarra, hS), fill: 'var(--serie-saida)' });
    pE.style.cursor = pS.style.cursor = 'pointer';
    svg.appendChild(pE);
    svg.appendChild(pS);

    const dica = `<strong>${escapeHTML(d.rotulo)}</strong>${d.sub ? `<span class="viz-tip-sub">${escapeHTML(d.sub)}</span>` : ''}
      <span class="viz-tip-linha"><i style="background:var(--serie-entrada)"></i>Entradas <b>${money(d.entradas)}</b></span>
      <span class="viz-tip-linha"><i style="background:var(--serie-saida)"></i>Saídas <b>${money(d.saidas)}</b></span>
      <span class="viz-tip-linha viz-tip-total">Resultado <b>${money(d.entradas - d.saidas)}</b></span>
      ${d.saldo != null ? `<span class="viz-tip-linha viz-tip-total">Saldo ao fim <b>${money(d.saldo)}</b></span>` : ''}`;
    ligarTooltip(container, pE, dica);
    ligarTooltip(container, pS, dica);

    // rótulo do período
    const t = el('text', { x: cx, y: h - (rotuloSaldo ? 26 : 10), 'text-anchor': 'middle', class: 'viz-eixo' });
    t.textContent = d.rotulo;
    svg.appendChild(t);

    if (rotuloSaldo && d.saldo != null) {
      const t2 = el('text', {
        x: cx, y: h - 8, 'text-anchor': 'middle',
        class: d.saldo < 0 ? 'viz-valor viz-negativo' : 'viz-valor',
      });
      t2.textContent = moneyShort(d.saldo);
      svg.appendChild(t2);
    }
  });

  container.insertBefore(svg, container.firstChild);
}

/** Linha de saldo acumulado (uma série, sem legenda por definição). */
export function graficoLinha(container, pontos, opcoes = {}) {
  container.classList.add('viz');
  container.querySelectorAll('svg').forEach((s) => s.remove());
  if (pontos.length < 2) return;

  const w = Math.max(280, container.clientWidth || 320);
  const h = opcoes.altura || 150;
  const padL = 24, padR = 24, padTop = 22, padBottom = 24;
  const larg = w - padL - padR, alt = h - padTop - padBottom;

  const vals = pontos.map((p) => p.valor);
  const min = Math.min(0, ...vals), max = Math.max(1, ...vals);
  const x = (i) => padL + (i / (pontos.length - 1)) * larg;
  const y = (v) => padTop + alt - ((v - min) / (max - min || 1)) * alt;

  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: 'img' });
  svg.setAttribute('aria-label', opcoes.descricao || 'Evolução do saldo');

  if (min < 0) {
    svg.appendChild(el('line', { x1: padL, x2: w - padR, y1: y(0), y2: y(0), stroke: 'var(--viz-base)', 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
  }

  const dLinha = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p.valor)}`).join(' ');
  const grad = el('linearGradient', { id: 'viz-area', x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(el('stop', { offset: '0%', 'stop-color': 'var(--serie-saldo)', 'stop-opacity': 0.22 }));
  grad.appendChild(el('stop', { offset: '100%', 'stop-color': 'var(--serie-saldo)', 'stop-opacity': 0 }));
  const defs = el('defs');
  defs.appendChild(grad);
  svg.appendChild(defs);
  svg.appendChild(el('path', {
    d: `${dLinha} L${x(pontos.length - 1)} ${padTop + alt} L${x(0)} ${padTop + alt} Z`,
    fill: 'url(#viz-area)',
  }));
  svg.appendChild(el('path', { d: dLinha, fill: 'none', stroke: 'var(--serie-saldo)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));

  pontos.forEach((p, i) => {
    const c = el('circle', { cx: x(i), cy: y(p.valor), r: 4.5, fill: 'var(--serie-saldo)', stroke: 'var(--viz-surface)', 'stroke-width': 2 });
    const alvo = el('circle', { cx: x(i), cy: y(p.valor), r: 16, fill: 'transparent' });
    alvo.style.cursor = 'pointer';
    svg.appendChild(c);
    svg.appendChild(alvo);
    ligarTooltip(container, alvo, `<strong>${escapeHTML(p.rotulo)}</strong><span class="viz-tip-linha viz-tip-total">Saldo <b>${money(p.valor)}</b></span>`);
    const ancora = i === 0 ? 'start' : i === pontos.length - 1 ? 'end' : 'middle';
    const t = el('text', { x: i === 0 ? padL - 16 : i === pontos.length - 1 ? w - padR + 16 : x(i), y: h - 8, 'text-anchor': ancora, class: 'viz-eixo' });
    t.textContent = p.rotulo;
    svg.appendChild(t);
  });

  // rótulo direto apenas no último ponto
  const ult = pontos[pontos.length - 1];
  const rot = el('text', { x: x(pontos.length - 1), y: Math.max(14, y(ult.valor) - 12), 'text-anchor': 'end', class: 'viz-valor' });
  rot.textContent = moneyShort(ult.valor);
  svg.appendChild(rot);

  container.insertBefore(svg, container.firstChild);
}

/** Barras horizontais para composição de gastos por categoria. */
export function graficoBarrasH(container, itens, opcoes = {}) {
  container.classList.add('viz');
  container.innerHTML = '';
  if (!itens.length) return;
  const total = itens.reduce((a, b) => a + b.valor, 0) || 1;
  const max = Math.max(...itens.map((i) => i.valor)) || 1;
  const frag = document.createDocumentFragment();
  for (const it of itens) {
    const linha = document.createElement('div');
    linha.className = 'barh';
    linha.innerHTML = `
      <div class="barh-topo">
        <span class="barh-nome">${it.icone ? `<span class="barh-ic">${escapeHTML(it.icone)}</span>` : ''}${escapeHTML(it.rotulo)}</span>
        <span class="barh-valor">${money(it.valor)}<em>${Math.round((it.valor / total) * 100)}%</em></span>
      </div>
      <div class="barh-trilho"><span style="width:${Math.max(2, (it.valor / max) * 100)}%;background:${it.cor || 'var(--serie-saida)'}"></span></div>`;
    frag.appendChild(linha);
  }
  container.appendChild(frag);
}

/** Legenda reutilizável (obrigatória a partir de 2 séries). */
export function legenda(series) {
  return `<div class="viz-legenda">${series
    .map((s) => `<span><i style="background:${s.cor}"></i>${escapeHTML(s.nome)}</span>`)
    .join('')}</div>`;
}
