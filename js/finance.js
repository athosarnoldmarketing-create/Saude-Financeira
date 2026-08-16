// finance.js — regras financeiras puras (sem DOM, testáveis isoladamente)
import {
  addDays, addMonths, dayOfMonth, daysInMonth, diffDays, fmtISO, groupBy, monthAdd,
  monthKey, monthRange, normalizeText, parseDate, sum, todayISO, uid, weekStart,
} from './util.js';

export const METODOS = [
  { id: 'pix', nome: 'Pix', caixa: true },
  { id: 'debito', nome: 'Débito', caixa: true },
  { id: 'dinheiro', nome: 'Dinheiro', caixa: true },
  { id: 'boleto', nome: 'Boleto', caixa: true },
  { id: 'transferencia', nome: 'Transferência', caixa: true },
  { id: 'credito', nome: 'Cartão de crédito', caixa: false },
];

export const isCaixa = (tx) => tx.metodo !== 'credito';

/* =====================================================================
   1. Recorrências — materialização das ocorrências
   ===================================================================== */

/** Datas de ocorrência de uma recorrência dentro de [de, ate] (YYYY-MM-DD). */
export function occurrencesBetween(rec, de, ate) {
  const out = [];
  const inicio = rec.inicio || de;
  const limite = rec.fim && rec.fim < ate ? rec.fim : ate;
  if (limite < de) return out;

  if (rec.frequencia === 'semanal' || rec.frequencia === 'quinzenal') {
    const passo = rec.frequencia === 'semanal' ? 7 : 14;
    // ancora na primeira ocorrência a partir do início
    let cur = inicio;
    const alvoDow = rec.diaSemana != null ? Number(rec.diaSemana) : parseDate(inicio).getDay();
    let guard = 0;
    while (parseDate(cur).getDay() !== alvoDow && guard++ < 7) cur = addDays(cur, 1);
    while (cur < de) cur = addDays(cur, passo);
    while (cur <= limite) {
      if (cur >= inicio) out.push(cur);
      cur = addDays(cur, passo);
    }
    return out;
  }

  if (rec.frequencia === 'anual') {
    const mes = rec.mes || Number(String(inicio).slice(5, 7));
    let ano = Number(String(de).slice(0, 4));
    for (let i = 0; i <= 2; i++) {
      const mk = `${ano + i}-${String(mes).padStart(2, '0')}`;
      const d = dayOfMonth(mk, rec.diaMes || Number(String(inicio).slice(8, 10)));
      if (d >= de && d <= limite && d >= inicio) out.push(d);
    }
    return out;
  }

  // mensal (padrão)
  let mk = monthKey(de);
  const fimMK = monthKey(limite);
  let guard = 0;
  while (mk <= fimMK && guard++ < 240) {
    const d = dayOfMonth(mk, rec.diaMes || 1);
    if (d >= de && d <= limite && d >= inicio) out.push(d);
    mk = monthAdd(mk, 1);
  }
  return out;
}

/**
 * Gera os lançamentos previstos das recorrências ativas até o horizonte.
 * Não recria ocorrências já existentes nem as que foram apagadas (soft delete).
 * Retorna os NOVOS lançamentos a inserir.
 */
export function generateRecurrenceTx(state, { de = todayISO(), meses = 3 } = {}) {
  const ate = monthRange(monthAdd(monthKey(de), meses)).end;
  const inicioJanela = monthRange(monthKey(de)).start;
  const novos = [];
  const existentes = new Set(
    state.transactions.filter((t) => t.recorrenciaId).map((t) => `${t.recorrenciaId}|${t.ocorrencia}`)
  );

  for (const rec of state.recurrences) {
    if (rec.deleted || rec.ativo === false) continue;
    for (const data of occurrencesBetween(rec, inicioJanela, ate)) {
      const chave = `${rec.id}|${data}`;
      if (existentes.has(chave)) continue;
      existentes.add(chave);
      novos.push({
        id: uid(),
        kind: 'tx',
        tipo: rec.tipo,
        valor: rec.valor,
        data,
        descricao: rec.descricao,
        categoriaId: rec.categoriaId || null,
        metodo: rec.metodo || 'pix',
        cartaoId: rec.cartaoId || null,
        pessoa: rec.pessoa || null,
        pago: false,
        recorrenciaId: rec.id,
        ocorrencia: data,
        parcela: null,
        metaId: null,
        obs: '',
        deleted: false,
      });
    }
  }
  return novos;
}

/* =====================================================================
   2. Cartão de crédito — competência de fatura
   ===================================================================== */

/**
 * Para uma compra na data informada, devolve a fatura em que ela cai.
 * Regra: compras até o dia do fechamento entram na fatura que fecha no
 * próprio mês; depois disso, na fatura do mês seguinte.
 */
export function faturaDaCompra(card, dataISO) {
  const fechamento = Number(card.diaFechamento) || 1;
  const vencimento = Number(card.diaVencimento) || 10;
  const dia = Number(String(dataISO).slice(8, 10));
  let mkFecha = monthKey(dataISO);
  if (dia > fechamento) mkFecha = monthAdd(mkFecha, 1);
  const dataFechamento = dayOfMonth(mkFecha, fechamento);
  const mkVence = vencimento > fechamento ? mkFecha : monthAdd(mkFecha, 1);
  const dataVencimento = dayOfMonth(mkVence, vencimento);
  return { faturaMK: mkFecha, dataFechamento, dataVencimento };
}

/** Todas as faturas com movimento dentro do intervalo de vencimento [de, ate]. */
export function faturas(state, de, ate) {
  const porFatura = new Map();
  for (const tx of state.transactions) {
    if (tx.deleted || tx.metodo !== 'credito' || !tx.cartaoId) continue;
    const card = state.cards.find((c) => c.id === tx.cartaoId);
    if (!card || card.deleted) continue;
    const f = faturaDaCompra(card, tx.data);
    const id = `${card.id}|${f.faturaMK}`;
    if (!porFatura.has(id)) {
      porFatura.set(id, {
        id, cartaoId: card.id, cartao: card.nome, cor: card.cor,
        faturaMK: f.faturaMK, dataFechamento: f.dataFechamento, dataVencimento: f.dataVencimento,
        total: 0, itens: [],
      });
    }
    const f2 = porFatura.get(id);
    f2.total += tx.tipo === 'saida' ? tx.valor : -tx.valor;
    f2.itens.push(tx);
  }
  const lista = [...porFatura.values()]
    .filter((f) => (!de || f.dataVencimento >= de) && (!ate || f.dataVencimento <= ate))
    .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));
  for (const f of lista) {
    const reg = state.invoices.find((i) => i.id === f.id && !i.deleted);
    f.pago = !!(reg && reg.pago);
    f.pagoEm = reg ? reg.pagoEm : null;
  }
  return lista;
}

/** Lançamentos de caixa "virtuais" gerados pelo vencimento das faturas. */
export function faturaAsCashflow(state, de, ate) {
  return faturas(state, de, ate)
    .filter((f) => f.total > 0)
    .map((f) => ({
      id: `fatura:${f.id}`,
      kind: 'fatura',
      tipo: 'saida',
      valor: f.total,
      data: f.dataVencimento,
      descricao: `Fatura ${f.cartao}`,
      categoriaId: null,
      metodo: 'boleto',
      cartaoId: f.cartaoId,
      pago: f.pago,
      virtual: true,
      faturaId: f.id,
    }));
}

/* =====================================================================
   3. Movimentos de caixa consolidados
   ===================================================================== */

/**
 * Lançamentos que afetam o caixa no intervalo: transações não-crédito +
 * faturas de cartão com vencimento no período.
 */
export function movimentosCaixa(state, de, ate) {
  const reais = state.transactions.filter(
    (t) => !t.deleted && isCaixa(t) && t.data >= de && t.data <= ate
  );
  return [...reais, ...faturaAsCashflow(state, de, ate)].sort((a, b) => a.data.localeCompare(b.data));
}

const assinado = (t) => (t.tipo === 'entrada' ? t.valor : -t.valor);

/** Saldo em caixa considerando apenas o que já foi efetivado até a data. */
export function saldoRealizado(state, ate = todayISO()) {
  const inicio = state.settings.saldoInicialData || '1900-01-01';
  const movs = movimentosCaixa(state, inicio, ate).filter((t) => t.pago);
  return (state.settings.saldoInicial || 0) + sum(movs, assinado);
}

/** Saldo projetado: realizado + tudo que está previsto até a data. */
export function saldoProjetado(state, ate) {
  const inicio = state.settings.saldoInicialData || '1900-01-01';
  const movs = movimentosCaixa(state, inicio, ate);
  return (state.settings.saldoInicial || 0) + sum(movs, assinado);
}

/* =====================================================================
   4. Resumo mensal e fluxo de caixa
   ===================================================================== */

export function resumoMes(state, mk) {
  const { start, end } = monthRange(mk);
  const movs = movimentosCaixa(state, start, end);
  const acc = {
    mk,
    entradas: 0, saidas: 0,
    entradasRealizadas: 0, saidasRealizadas: 0,
    entradasPrevistas: 0, saidasPrevistas: 0,
  };
  for (const t of movs) {
    if (t.tipo === 'entrada') {
      acc.entradas += t.valor;
      if (t.pago) acc.entradasRealizadas += t.valor; else acc.entradasPrevistas += t.valor;
    } else {
      acc.saidas += t.valor;
      if (t.pago) acc.saidasRealizadas += t.valor; else acc.saidasPrevistas += t.valor;
    }
  }
  acc.resultado = acc.entradas - acc.saidas;
  acc.resultadoRealizado = acc.entradasRealizadas - acc.saidasRealizadas;
  acc.saldoFim = saldoProjetado(state, end);
  return acc;
}

/** Série de fluxo de caixa mês a mês, com saldo acumulado projetado. */
export function fluxoCaixa(state, mkDe, mkAte) {
  const out = [];
  let mk = mkDe;
  let guard = 0;
  while (mk <= mkAte && guard++ < 120) {
    out.push(resumoMes(state, mk));
    mk = monthAdd(mk, 1);
  }
  return out;
}

/* =====================================================================
   5. Provisão semanal (coração do dashboard)
   ===================================================================== */

/**
 * Semanas (segunda a domingo) a partir da semana corrente.
 * Cada semana traz entradas/saídas previstas, o que já foi realizado e o
 * saldo projetado ao final da semana.
 */
export function provisaoSemanal(state, { semanas = 5, hoje = todayISO() } = {}) {
  const out = [];
  let ini = weekStart(hoje);
  for (let i = 0; i < semanas; i++) {
    const fim = addDays(ini, 6);
    const movs = movimentosCaixa(state, ini, fim);
    const linha = {
      inicio: ini, fim, indice: i,
      entradas: 0, saidas: 0,
      entradasRealizadas: 0, saidasRealizadas: 0,
      aPagar: [], aReceber: [],
    };
    for (const t of movs) {
      if (t.tipo === 'entrada') {
        linha.entradas += t.valor;
        if (t.pago) linha.entradasRealizadas += t.valor; else linha.aReceber.push(t);
      } else {
        linha.saidas += t.valor;
        if (t.pago) linha.saidasRealizadas += t.valor; else linha.aPagar.push(t);
      }
    }
    linha.resultado = linha.entradas - linha.saidas;
    linha.saldoFim = saldoProjetado(state, fim);
    linha.atual = hoje >= ini && hoje <= fim;
    out.push(linha);
    ini = addDays(ini, 7);
  }
  return out;
}

/* =====================================================================
   6. Orçamento por categoria
   ===================================================================== */

export function orcamentoMes(state, mk) {
  const { start, end } = monthRange(mk);
  const gastos = state.transactions.filter(
    (t) => !t.deleted && t.tipo === 'saida' && t.data >= start && t.data <= end
  );
  const porCat = groupBy(gastos, (t) => t.categoriaId || 'sem-categoria');
  const linhas = state.categories
    .filter((c) => !c.deleted && c.tipo === 'saida')
    .map((c) => {
      const itens = porCat.get(c.id) || [];
      const gasto = sum(itens, (t) => t.valor);
      const gastoRealizado = sum(itens.filter((t) => t.pago), (t) => t.valor);
      const orcamento = c.orcamento || 0;
      return {
        categoria: c, orcamento, gasto, gastoRealizado, itens: itens.length,
        pct: orcamento > 0 ? gasto / orcamento : null,
        saldo: orcamento - gasto,
        status: orcamento <= 0 ? 'sem-meta' : gasto > orcamento ? 'estourado' : gasto >= orcamento * 0.85 ? 'atencao' : 'ok',
      };
    });
  const semCat = porCat.get('sem-categoria') || [];
  if (semCat.length) {
    linhas.push({
      categoria: { id: 'sem-categoria', nome: 'Sem categoria', cor: '#898781', icone: '❓' },
      orcamento: 0, gasto: sum(semCat, (t) => t.valor),
      gastoRealizado: sum(semCat.filter((t) => t.pago), (t) => t.valor),
      itens: semCat.length, pct: null, saldo: 0, status: 'sem-meta',
    });
  }
  return linhas.sort((a, b) => b.gasto - a.gasto);
}

/* =====================================================================
   7. Contas a pagar / receber
   ===================================================================== */

export function pendencias(state, { dias = 30, hoje = todayISO() } = {}) {
  const ate = addDays(hoje, dias);
  const movs = movimentosCaixa(state, '1900-01-01', ate).filter((t) => !t.pago);
  return movs.map((t) => ({
    ...t,
    diasRestantes: diffDays(hoje, t.data),
    atrasado: t.data < hoje,
  }));
}

/* =====================================================================
   8. Detecção de recorrências (mesma loja / origem repetida)
   ===================================================================== */

/**
 * Procura descrições que se repetem em meses distintos e ainda não estão
 * cadastradas como recorrência. Serve de sugestão, nunca cria nada sozinho.
 */
export function sugestoesRecorrencia(state, { minOcorrencias = 3, hoje = todayISO() } = {}) {
  const desde = addMonths(hoje, -6);
  const itens = state.transactions.filter(
    (t) => !t.deleted && !t.recorrenciaId && t.data >= desde && normalizeText(t.descricao).length > 2
  );
  const jaCadastradas = new Set(state.recurrences.filter((r) => !r.deleted).map((r) => normalizeText(r.descricao)));
  const grupos = groupBy(itens, (t) => `${t.tipo}|${normalizeText(t.descricao)}`);
  const out = [];

  for (const [chave, lista] of grupos) {
    const [tipo, nome] = chave.split('|');
    if (jaCadastradas.has(nome)) continue;
    const meses = new Set(lista.map((t) => monthKey(t.data)));
    if (lista.length < minOcorrencias || meses.size < 2) continue;
    const valores = lista.map((t) => t.valor).sort((a, b) => a - b);
    const mediana = valores[Math.floor(valores.length / 2)];
    const dias = lista.map((t) => Number(t.data.slice(8, 10))).sort((a, b) => a - b);
    const diaTipico = dias[Math.floor(dias.length / 2)];
    const variacao = mediana > 0 ? (valores[valores.length - 1] - valores[0]) / mediana : 0;
    out.push({
      chave, tipo, descricao: lista[lista.length - 1].descricao,
      ocorrencias: lista.length, meses: meses.size,
      valorMediano: mediana, diaTipico,
      categoriaId: lista[lista.length - 1].categoriaId || null,
      metodo: lista[lista.length - 1].metodo || 'pix',
      valorFixo: variacao < 0.1,
      ultima: lista[lista.length - 1].data,
    });
  }
  return out.sort((a, b) => b.ocorrencias - a.ocorrencias || b.valorMediano - a.valorMediano);
}

/* =====================================================================
   9. Metas
   ===================================================================== */

export function progressoMetas(state) {
  return state.goals
    .filter((g) => !g.deleted)
    .map((g) => {
      const aportes = state.transactions.filter((t) => !t.deleted && t.metaId === g.id);
      const acumulado = (g.saldoInicial || 0) + sum(aportes, (t) => (t.tipo === 'saida' ? t.valor : -t.valor));
      const pct = g.alvo > 0 ? acumulado / g.alvo : 0;
      const falta = Math.max(0, (g.alvo || 0) - acumulado);
      let mensalNecessario = null;
      if (g.prazo && falta > 0) {
        const meses = Math.max(1, Math.round(diffDays(todayISO(), g.prazo) / 30));
        mensalNecessario = Math.round(falta / meses);
      }
      return { ...g, acumulado, pct, falta, mensalNecessario, aportes: aportes.length };
    })
    .sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999'));
}

/* =====================================================================
   10. Parcelamento
   ===================================================================== */

/** Divide um valor em N parcelas sem perder centavos na conta. */
export function dividirParcelas(total, n) {
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

export function gerarParcelas(tx, n) {
  const grupoId = uid();
  return dividirParcelas(tx.valor, n).map((valor, i) => ({
    ...tx,
    id: i === 0 ? tx.id : uid(),
    valor,
    data: i === 0 ? tx.data : addMonths(tx.data, i),
    pago: i === 0 ? tx.pago : false,
    parcela: { n: i + 1, total: n, grupoId },
    descricao: tx.descricao,
  }));
}

/* =====================================================================
   11. Top gastos e comparativos
   ===================================================================== */

export function topDescricoes(state, mk, limite = 6) {
  const { start, end } = monthRange(mk);
  const gastos = state.transactions.filter(
    (t) => !t.deleted && t.tipo === 'saida' && t.data >= start && t.data <= end
  );
  const grupos = groupBy(gastos, (t) => normalizeText(t.descricao) || 'outros');
  return [...grupos.entries()]
    .map(([, lista]) => ({
      descricao: lista[0].descricao,
      total: sum(lista, (t) => t.valor),
      vezes: lista.length,
      categoriaId: lista[0].categoriaId,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limite);
}

export function mediaMensal(state, mkAte, meses = 3) {
  const de = monthAdd(mkAte, -(meses - 1));
  const serie = fluxoCaixa(state, de, mkAte);
  if (!serie.length) return { entradas: 0, saidas: 0 };
  return {
    entradas: Math.round(sum(serie, (m) => m.entradas) / serie.length),
    saidas: Math.round(sum(serie, (m) => m.saidas) / serie.length),
  };
}
