const els = {
  periodTabs: document.querySelectorAll('#period-tabs .segment'),
  status: document.getElementById('benchmark-status'),
  tableWrap: document.getElementById('benchmark-table-wrap'),
  rows: document.getElementById('benchmark-rows'),
};

const state = { period: 'today' };

function fmtMontoCurrency(n, currency) {
  if (n == null) return '—';
  const symbol = currency === 'ARS' ? '$' : 'U$S';
  return `${symbol} ${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

function fmtPct(n) {
  return n == null ? '—' : `${Number(n).toFixed(2)}%`;
}

async function loadBenchmark() {
  els.status.style.display = 'block';
  els.status.textContent = 'Cargando...';
  els.tableWrap.style.display = 'none';

  try {
    const res = await fetch(`/api/benchmark?period=${state.period}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || json.error || 'Error');

    const data = json.data.filter(d => d.eao > 0);

    if (data.length === 0) {
      els.status.textContent = 'Sin oportunidades detectadas en este período (necesita spread > 1% con operaciones reales en ambos lados).';
      return;
    }

    els.status.style.display = 'none';
    els.tableWrap.style.display = 'block';

    els.rows.innerHTML = data.map((d, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="symbol"><a class="symbol-link" href="/historia.html?symbol=${d.symbol}">${d.symbol}</a></td>
        <td class="num">${fmtMontoCurrency(d.bidMonto, d.currency)}</td>
        <td class="num">${fmtMontoCurrency(d.askMonto, d.currency)}</td>
        <td class="num">${fmtMontoCurrency(d.crossableVolume, d.currency)}</td>
        <td class="num">${fmtPct(d.avgSpreadWeighted)}</td>
        <td class="num">${d.operations}</td>
        <td class="num"><strong>${fmtMontoCurrency(d.eao, d.currency)}</strong></td>
      </tr>
    `).join('');
  } catch (e) {
    els.status.style.display = 'block';
    els.status.textContent = `Error: ${e.message}`;
  }
}

els.periodTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    els.periodTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.period = tab.dataset.period;
    loadBenchmark();
  });
});

loadBenchmark();
