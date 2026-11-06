/* app.js — Lógica Frontend ES6+ para Botica Nova Salud (Red FarmaPlus) - PIAD-527 */

const localHostnames = new Set(['localhost', '127.0.0.1', '[::1]']);
const rawApiBase = typeof window.__API_BASE__ === 'string' ? window.__API_BASE__ : '__PORT_8000__';
const isUnresolved = rawApiBase.startsWith('__PORT_');

if (isUnresolved && !localHostnames.has(location.hostname)) {
  throw new Error('El marcador de puerto del servidor backend no fue reescrito.');
}

const API_BASE = isUnresolved ? `http://${location.hostname}:8000` : rawApiBase;

// Estado en memoria (Sin almacenamiento bloqueado en iframe)
const state = {
  currentView: 'dashboard',
  currentRecordTab: 'sales',
  theme: 'light',
  dashboard: null,
  products: [],
  categories: [],
  alerts: null,
  sales: [],
  kardex: [],
  customers: [],
  cart: [],
  posTimerSec: 12,
  posTimerInterval: null,
  lastReceipt: null,
  charts: {
    salesByCategory: null,
    stockHealth: null
  }
};

const VIEW_HEADERS = {
  dashboard: {
    title: 'Panel Ejecutivo y Control Operativo',
    subtitle: 'Monitoreo en tiempo real de stock, alertas de reposición y velocidad de atención al cliente en Botica Nova Salud'
  },
  pos: {
    title: 'Punto de Venta Ágil y Atención Farmacéutica (POS)',
    subtitle: 'Dispensación rápida por principio activo o síntoma con descuento automático de stock y control de recetas'
  },
  inventory: {
    title: 'Inventario Centralizado de Medicamentos',
    subtitle: 'Control de stock en tiempo real, ubicación en anaquel, lotes FEFO y registros sanitarios DIGEMID'
  },
  alerts: {
    title: 'Módulo de Alertas de Reposición y Vencimientos (FEFO)',
    subtitle: 'Detección temprana de quiebres de stock y generación automatizada de órdenes de compra a droguerías'
  },
  records: {
    title: 'Historial de Ventas, Clientes y Auditoría Kardex',
    subtitle: 'Trazabilidad completa de comprobantes emitidos, anulaciones con reversión de stock y ficha de clientes'
  },
  academic: {
    title: 'Propuesta de Solución Técnica — Trabajo Final PIAD-527',
    subtitle: 'Fundamentación técnica, arquitectura Cliente-Servidor (Node.js + Express + SQLite) y resolución de preguntas guía'
  }
};

// Función auxiliar de petición HTTP al Backend Express
async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  };
  const response = await fetch(url, config);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Error HTTP ${response.status}`);
  }
  return data;
}

function formatMoney(amount) {
  return `S/ ${Number(amount || 0).toFixed(2)}`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getActiveCashier() {
  const sel = document.getElementById('active-cashier-select');
  return sel ? sel.value : 'Q.F. Elena Vargas (DT)';
}

function showToast(message, type = 'success') {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const item = document.createElement('div');
  item.className = 'toast-item';
  if (type === 'danger') {
    item.style.borderColor = 'var(--color-danger)';
  } else if (type === 'warning') {
    item.style.borderColor = 'var(--color-warning)';
  }
  item.innerHTML = `
    <span style="flex:1;">${escapeHtml(message)}</span>
  `;
  stack.appendChild(item);
  setTimeout(() => {
    item.remove();
  }, 3600);
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// ==========================================
// NAVEGACIÓN ENTRE VISTAS Y MODALES
// ==========================================
function switchView(viewName) {
  if (!VIEW_HEADERS[viewName]) return;
  state.currentView = viewName;

  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `view-${viewName}`);
  });

  document.querySelectorAll('[data-nav-target]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-nav-target') === viewName);
  });

  const headerInfo = VIEW_HEADERS[viewName];
  document.getElementById('current-view-title').textContent = headerInfo.title;
  document.getElementById('current-view-subtitle').textContent = headerInfo.subtitle;

  const mainEl = document.getElementById('main-content');
  if (mainEl) mainEl.scrollTop = 0;
  window.scrollTo(0, 0);

  if (viewName === 'pos') {
    const searchInput = document.getElementById('pos-search-input');
    if (searchInput) searchInput.focus({ preventScroll: true });
  }
}

function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) {
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) {
    el.classList.remove('open');
    document.body.style.overflow = '';
  }
}

// ==========================================
// CARGA GLOBAL Y SINCRONIZACIÓN DE DATOS
// ==========================================
async function loadAllData() {
  try {
    const [dashData, prodData, alertsData, salesData, kardexData, custData] = await Promise.all([
      apiFetch('/api/dashboard'),
      apiFetch('/api/products'),
      apiFetch('/api/alerts'),
      apiFetch('/api/sales'),
      apiFetch('/api/kardex'),
      apiFetch('/api/customers')
    ]);

    state.dashboard = dashData;
    state.products = prodData.products || [];
    state.categories = prodData.categories || [];
    state.alerts = alertsData;
    state.sales = salesData.sales || [];
    state.kardex = kardexData.movements || [];
    state.customers = custData.customers || [];

    populateCategorySelects();
    renderDashboard();
    renderPosCatalog();
    renderPosCustomers();
    renderCart();
    renderInventoryTable();
    renderAlertsView();
    renderRecordsView();
    refreshIcons();
    window.appReady = true;
  } catch (err) {
    showToast(`Error sincronizando datos: ${err.message}`, 'danger');
  }
}

function populateCategorySelects() {
  const selects = [
    document.getElementById('pos-category-filter'),
    document.getElementById('inv-category-filter')
  ];
  selects.forEach(sel => {
    if (!sel) return;
    const currentVal = sel.value || 'ALL';
    sel.innerHTML = '<option value="ALL">Todas las Categorías</option>' +
      state.categories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
    sel.value = currentVal;
  });
}

// ==========================================
// RENDERIZADO VISTA 1: DASHBOARD EJECUTIVO
// ==========================================
function renderDashboard() {
  if (!state.dashboard) return;
  const { kpis, charts, critical_alerts, recent_sales } = state.dashboard;

  document.getElementById('kpi-total-revenue').textContent = formatMoney(kpis.total_revenue);
  document.getElementById('kpi-sales-count').textContent = `${kpis.completed_sales_count} tickets emitidos`;
  document.getElementById('kpi-avg-ticket').textContent = `Ticket prom: ${formatMoney(kpis.avg_ticket)}`;

  document.getElementById('kpi-service-time').textContent = `${kpis.avg_service_time_sec} seg`;
  document.getElementById('kpi-time-reduction').textContent = `-${kpis.time_reduction_pct}% vs manual`;

  document.getElementById('kpi-alerts-total').textContent = `${kpis.total_alerts_count} alertas`;
  document.getElementById('kpi-out-count').textContent = `${kpis.out_of_stock_count} agotados`;
  document.getElementById('kpi-low-count').textContent = `${kpis.low_stock_count} stock bajo`;

  document.getElementById('kpi-inventory-value').textContent = formatMoney(kpis.inventory_retail_value);
  document.getElementById('kpi-total-units').textContent = `${kpis.total_units} unid. (${kpis.total_skus} SKUs)`;

  // Badges de navegación
  document.getElementById('nav-sku-count').textContent = `${kpis.total_skus} SKU`;
  document.querySelectorAll('.js-alert-count').forEach(el => {
    el.textContent = kpis.total_alerts_count;
  });

  // Banner de alerta temprana
  const alertHeadline = document.getElementById('dashboard-alert-headline');
  const alertSubtext = document.getElementById('dashboard-alert-subtext');
  const alertStrip = document.getElementById('dashboard-alert-strip');

  if (kpis.out_of_stock_count > 0 || kpis.low_stock_count > 0) {
    alertStrip.style.background = 'var(--color-warning-bg)';
    alertStrip.style.borderColor = 'var(--color-warning-border)';
    alertHeadline.textContent = `Atención: ${kpis.out_of_stock_count} medicamento(s) agotado(s) y ${kpis.low_stock_count} con stock bajo de seguridad`;
    alertSubtext.textContent = `Además se detectaron ${kpis.expiring_soon_count} lote(s) próximos a vencer (control FEFO). Puede reabastecer los productos críticos en un solo clic.`;
  } else {
    alertStrip.style.background = 'var(--color-success-bg)';
    alertStrip.style.borderColor = 'var(--color-success-border)';
    alertHeadline.textContent = 'Inventario 100% Abastecido — Cero Quiebres de Stock Activos';
    alertSubtext.textContent = 'Todos los medicamentos superan su stock mínimo de seguridad.';
  }

  // Tabla de productos críticos en Dashboard
  const critTbody = document.getElementById('dash-critical-tbody');
  if (critical_alerts.length === 0) {
    critTbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center;padding:var(--space-5);color:var(--color-text-muted);">
          Todos los medicamentos cuentan con stock óptimo y vigencia saludable.
        </td>
      </tr>
    `;
  } else {
    critTbody.innerHTML = critical_alerts.slice(0, 6).map(p => {
      const badge = getStockBadgeHtml(p);
      return `
        <tr>
          <td>
            <div style="font-weight:700;">${escapeHtml(p.name)}</div>
            <div class="mono-val" style="color:var(--color-text-muted);">${escapeHtml(p.sku)} · ${escapeHtml(p.location)}</div>
          </td>
          <td class="mono-val">
            <strong>${p.stock}</strong> / mín. ${p.min_stock}
          </td>
          <td>${badge}</td>
          <td>
            <button type="button" class="btn btn-primary btn-sm" onclick="openRestockModal(${p.id})" data-testid="dash-restock-${p.id}">
              + Reabastecer
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Tabla de últimas ventas en Dashboard
  const salesTbody = document.getElementById('dash-sales-tbody');
  salesTbody.innerHTML = recent_sales.map(s => `
    <tr>
      <td>
        <span class="mono-val" style="font-weight:700;">${escapeHtml(s.ticket_number)}</span>
        <div style="font-size:var(--text-xs);color:var(--color-text-muted);">${escapeHtml(s.payment_method)}</div>
      </td>
      <td>
        <div style="font-weight:600;">${escapeHtml(s.customer_name)}</div>
        <div class="mono-val" style="color:var(--color-text-muted);">${escapeHtml(s.customer_doc)}</div>
      </td>
      <td>
        <span class="badge badge-success mono-val">${s.service_time_sec}s</span>
      </td>
      <td class="mono-val" style="font-weight:700;">${formatMoney(s.total)}</td>
      <td>
        <button type="button" class="btn btn-secondary btn-sm" onclick="viewReceiptById(${s.id})" data-testid="dash-receipt-${s.id}">
          Ver Ticket
        </button>
      </td>
    </tr>
  `).join('');

  renderDashboardCharts(charts);
}

function getStockBadgeHtml(p) {
  if (p.stock_status === 'AGOTADO') {
    return `<span class="badge badge-danger">Agotado (0)</span>`;
  }
  if (p.stock_status === 'STOCK_BAJO') {
    return `<span class="badge badge-warning">Stock Bajo (${p.stock})</span>`;
  }
  if (p.expiry_status !== 'VIGENTE') {
    return `<span class="badge badge-info">FEFO (${p.days_to_expiry}d)</span>`;
  }
  return `<span class="badge badge-success">Óptimo (${p.stock})</span>`;
}

function renderDashboardCharts(charts) {
  if (typeof window.Chart === 'undefined') return;

  const isDark = state.theme === 'dark';
  const textColor = isDark ? '#9eb5b0' : '#465e59';
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(16,36,32,0.07)';

  // 1. Gráfico de Ventas por Categoría
  const ctxCat = document.getElementById('chart-sales-category');
  if (ctxCat) {
    if (state.charts.salesByCategory) {
      state.charts.salesByCategory.destroy();
    }
    const labels = (charts.sales_by_category || []).map(c => c.category.replace(' y ', ' / '));
    const values = (charts.sales_by_category || []).map(c => c.revenue);

    state.charts.salesByCategory = new window.Chart(ctxCat, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Ventas (S/)',
            data: values,
            backgroundColor: isDark ? '#2bb5a8' : '#0b6e65',
            borderRadius: 6,
            maxBarThickness: 38
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            ticks: { color: textColor, font: { size: 11 } },
            grid: { display: false }
          },
          y: {
            ticks: {
              color: textColor,
              font: { size: 11 },
              callback: val => `S/ ${val}`
            },
            grid: { color: gridColor }
          }
        }
      }
    });
  }

  // 2. Gráfico de Salud de Inventario
  const ctxHealth = document.getElementById('chart-stock-health');
  if (ctxHealth) {
    if (state.charts.stockHealth) {
      state.charts.stockHealth.destroy();
    }
    const dist = charts.stock_distribution || { optimo: 0, stock_bajo: 0, agotado: 0, proximo_vencer: 0 };

    state.charts.stockHealth = new window.Chart(ctxHealth, {
      type: 'doughnut',
      data: {
        labels: ['Stock Óptimo', 'Stock Bajo (Reorden)', 'Agotado (Crítico)', 'Alerta Vencimiento FEFO'],
        datasets: [
          {
            data: [dist.optimo, dist.stock_bajo, dist.agotado, dist.proximo_vencer],
            backgroundColor: ['#156d3b', '#d97706', '#b42318', '#1849a9'],
            borderWidth: 2,
            borderColor: isDark ? '#121e1c' : '#ffffff'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        cutout: '62%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: textColor,
              font: { size: 12 },
              boxWidth: 14,
              padding: 14
            }
          }
        }
      }
    });
  }
}

// ==========================================
// RENDERIZADO VISTA 2: PUNTO DE VENTA (POS)
// ==========================================
function startPosTimer() {
  if (state.posTimerInterval) clearInterval(state.posTimerInterval);
  state.posTimerInterval = setInterval(() => {
    if (state.cart.length > 0) {
      state.posTimerSec += 1;
    }
    updatePosTimerBadge();
  }, 1000);
}

function updatePosTimerBadge() {
  const badge = document.getElementById('pos-timer-display');
  if (!badge) return;
  const mins = String(Math.floor(state.posTimerSec / 60)).padStart(2, '0');
  const secs = String(state.posTimerSec % 60).padStart(2, '0');
  badge.textContent = `${mins}:${secs} seg (${state.posTimerSec}s vs 270s manual)`;
}

function renderPosCatalog() {
  const grid = document.getElementById('pos-catalog-grid');
  if (!grid) return;

  const q = (document.getElementById('pos-search-input')?.value || '').trim().toLowerCase();
  const cat = document.getElementById('pos-category-filter')?.value || 'ALL';

  const filtered = state.products.filter(p => {
    const matchCat = cat === 'ALL' || p.category === cat;
    const matchText = !q ||
      p.name.toLowerCase().includes(q) ||
      p.active_ingredient.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.indications.toLowerCase().includes(q) ||
      p.laboratory.toLowerCase().includes(q);
    return matchCat && matchText;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding: var(--space-8); color: var(--color-text-muted);">
        No se encontraron medicamentos con ese criterio. Pruebe buscando por principio activo o síntoma.
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const isOut = p.stock <= 0;
    const stockBadge = getStockBadgeHtml(p);
    const rxBadge = p.requires_prescription
      ? `<span class="badge badge-info" title="Requiere Receta Médica">Rx Receta</span>`
      : `<span class="badge badge-neutral">Venta Libre</span>`;

    return `
      <article class="med-card ${isOut ? 'out-of-stock' : ''}" data-testid="pos-card-${p.id}">
        <div>
          <div class="med-top">
            <span class="mono-val" style="color:var(--color-text-muted);font-weight:700;">${escapeHtml(p.sku)} · ${escapeHtml(p.location)}</span>
            ${stockBadge}
          </div>
          <div class="med-name" style="margin-top:4px;">${escapeHtml(p.name)}</div>
          <div class="med-dci">${escapeHtml(p.active_ingredient)}</div>
          <div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:4px;">
            ${escapeHtml(p.presentation)} · <strong>${escapeHtml(p.laboratory)}</strong>
          </div>
        </div>

        <div class="med-indications">
          <strong>Indicación:</strong> ${escapeHtml(p.indications)}
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;flex-wrap:wrap;">
          ${rxBadge}
          <span class="mono-val" style="color:var(--color-text-muted);">Lote: ${escapeHtml(p.batch_code)} (Vence: ${escapeHtml(p.expiry_date)})</span>
        </div>

        <div class="med-footer">
          <div class="med-price">${formatMoney(p.sale_price)}</div>
          <div style="display:flex;gap:6px;">
            ${isOut || p.stock_status === 'STOCK_BAJO' ? `
              <button type="button" class="btn btn-secondary btn-sm" onclick="openAlternativesModal(${p.id})" title="Ver bioequivalentes con el mismo principio activo" data-testid="pos-alt-${p.id}">
                Sustitutos
              </button>
            ` : ''}
            ${isOut ? `
              <button type="button" class="btn btn-warning btn-sm" onclick="openRestockModal(${p.id})" data-testid="pos-restock-${p.id}">
                Reabastecer
              </button>
            ` : `
              <button type="button" class="btn btn-primary btn-sm" onclick="addToCart(${p.id})" data-testid="pos-add-${p.id}">
                + Agregar
              </button>
            `}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function renderPosCustomers() {
  const sel = document.getElementById('pos-customer-select');
  if (!sel) return;
  const currentId = sel.value || '1';
  sel.innerHTML = state.customers.map(c => `
    <option value="${c.id}">
      ${escapeHtml(c.full_name)} (${escapeHtml(c.doc_type)}: ${escapeHtml(c.doc_number)})
    </option>
  `).join('');
  if (state.customers.some(c => String(c.id) === String(currentId))) {
    sel.value = currentId;
  }
  updateCustomerAllergyBanner();
}

function updateCustomerAllergyBanner() {
  const sel = document.getElementById('pos-customer-select');
  const banner = document.getElementById('pos-allergy-banner');
  if (!sel || !banner) return;

  const cust = state.customers.find(c => String(c.id) === String(sel.value));
  if (cust && cust.allergies_notes && !cust.allergies_notes.toLowerCase().includes('ninguna') && !cust.allergies_notes.toLowerCase().includes('sin ficha')) {
    banner.style.display = 'flex';
    banner.textContent = `Ficha Farmacovigilancia: ${cust.allergies_notes}`;
  } else {
    banner.style.display = 'none';
  }
}

function addToCart(productId) {
  const prod = state.products.find(p => p.id === Number(productId));
  if (!prod) return;
  if (prod.stock <= 0) {
    showToast(`"${prod.name}" está agotado. Revise sustitutos bioequivalentes o reabastezca.`, 'warning');
    return;
  }

  const existing = state.cart.find(item => item.product_id === prod.id);
  if (existing) {
    if (existing.quantity + 1 > prod.stock) {
      showToast(`Stock máximo disponible alcanzado (${prod.stock} unid.) para ${prod.name}.`, 'warning');
      return;
    }
    existing.quantity += 1;
  } else {
    if (state.cart.length === 0) {
      state.posTimerSec = 15;
    }
    state.cart.push({
      product_id: prod.id,
      sku: prod.sku,
      name: prod.name,
      sale_price: prod.sale_price,
      max_stock: prod.stock,
      requires_prescription: prod.requires_prescription,
      batch_code: prod.batch_code,
      quantity: 1
    });
  }

  hidePosError();
  renderCart();
}

function updateCartQuantity(productId, delta) {
  const idx = state.cart.findIndex(i => i.product_id === Number(productId));
  if (idx === -1) return;

  const item = state.cart[idx];
  const nextQty = item.quantity + delta;
  if (nextQty <= 0) {
    state.cart.splice(idx, 1);
  } else if (nextQty > item.max_stock) {
    showToast(`Solo hay ${item.max_stock} unidades en stock de ${item.name}.`, 'warning');
    return;
  } else {
    item.quantity = nextQty;
  }
  renderCart();
}

function renderCart() {
  const listEl = document.getElementById('pos-cart-list');
  const rxBox = document.getElementById('pos-rx-box');
  const navBadge = document.getElementById('nav-cart-badge');

  const totalItems = state.cart.reduce((acc, i) => acc + i.quantity, 0);
  if (navBadge) {
    navBadge.textContent = totalItems > 0 ? `${totalItems} ítem(s)` : 'Ágil';
  }

  if (state.cart.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center;padding:var(--space-5) var(--space-3);color:var(--color-text-muted);font-size:var(--text-xs);border:1px dashed var(--color-border);border-radius:var(--radius-md);">
        Seleccione medicamentos del catálogo izquierdo para iniciar la dispensación.
      </div>
    `;
  } else {
    listEl.innerHTML = state.cart.map(item => `
      <div class="cart-item" data-testid="cart-item-${item.product_id}">
        <div style="min-width:0;flex:1;">
          <div style="font-weight:700;font-size:var(--text-xs);overflow-wrap:anywhere;">
            ${escapeHtml(item.name)}
            ${item.requires_prescription ? `<span class="badge badge-info" style="padding:1px 6px;font-size:10px;">Rx</span>` : ''}
          </div>
          <div class="mono-val" style="color:var(--color-text-muted);">
            ${formatMoney(item.sale_price)} c/u · Subtotal: <strong>${formatMoney(item.sale_price * item.quantity)}</strong>
          </div>
        </div>
        <div class="cart-qty-controls">
          <button type="button" class="qty-btn" onclick="updateCartQuantity(${item.product_id}, -1)" aria-label="Disminuir cantidad" data-testid="cart-dec-${item.product_id}">−</button>
          <span class="mono-val" style="min-width:22px;text-align:center;font-weight:700;">${item.quantity}</span>
          <button type="button" class="qty-btn" onclick="updateCartQuantity(${item.product_id}, 1)" aria-label="Aumentar cantidad" data-testid="cart-inc-${item.product_id}">+</button>
        </div>
      </div>
    `).join('');
  }

  // Mostrar campo Rx si algún medicamento requiere receta
  const needsRx = state.cart.some(i => i.requires_prescription);
  if (rxBox) {
    rxBox.style.display = needsRx ? 'flex' : 'none';
  }

  // Calcular totales
  const total = Number(state.cart.reduce((acc, i) => acc + i.sale_price * i.quantity, 0).toFixed(2));
  const subtotal = Number((total / 1.18).toFixed(2));
  const igv = Number((total - subtotal).toFixed(2));

  document.getElementById('pos-subtotal').textContent = formatMoney(subtotal);
  document.getElementById('pos-igv').textContent = formatMoney(igv);
  document.getElementById('pos-total').textContent = formatMoney(total);

  updateCashChangeDisplay(total);
}

function updateCashChangeDisplay(currentTotal) {
  const total = currentTotal !== undefined
    ? currentTotal
    : Number(state.cart.reduce((acc, i) => acc + i.sale_price * i.quantity, 0).toFixed(2));

  const receivedInput = document.getElementById('pos-amount-received');
  const changeDisplay = document.getElementById('pos-change-display');
  if (!receivedInput || !changeDisplay) return;

  const receivedVal = Number(receivedInput.value);
  if (!receivedInput.value || receivedVal <= total) {
    changeDisplay.textContent = 'S/ 0.00';
  } else {
    changeDisplay.textContent = formatMoney(receivedVal - total);
  }
}

function showPosError(msg) {
  const el = document.getElementById('pos-inline-error');
  if (el) {
    el.textContent = msg;
    el.style.display = 'flex';
  }
}

function hidePosError() {
  const el = document.getElementById('pos-inline-error');
  if (el) {
    el.style.display = 'none';
    el.textContent = '';
  }
}

async function submitPosSale() {
  hidePosError();
  if (state.cart.length === 0) {
    showPosError('Agregue al menos un medicamento al carrito antes de confirmar la venta.');
    return;
  }

  const needsRx = state.cart.some(i => i.requires_prescription);
  const rxRef = (document.getElementById('pos-rx-input')?.value || '').trim();
  if (needsRx && !rxRef) {
    showPosError('Uno o más medicamentos requieren Receta Médica (Rx). Ingrese el N° CMP o referencia.');
    document.getElementById('pos-rx-input')?.focus();
    return;
  }

  const custId = Number(document.getElementById('pos-customer-select')?.value || 1);
  const custObj = state.customers.find(c => c.id === custId) || {
    id: 1,
    full_name: 'Cliente Eventual de Mostrador',
    doc_number: '00000000'
  };

  const voucherType = document.getElementById('pos-voucher-type').value;
  const paymentMethod = document.getElementById('pos-payment-method').value;
  const total = Number(state.cart.reduce((acc, i) => acc + i.sale_price * i.quantity, 0).toFixed(2));
  const rawReceived = Number(document.getElementById('pos-amount-received').value);
  const amountReceived = rawReceived >= total ? rawReceived : total;

  try {
    const createdSale = await apiFetch('/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        voucher_type: voucherType,
        customer_id: custObj.id,
        customer_name: custObj.full_name,
        customer_doc: custObj.doc_number,
        payment_method: paymentMethod,
        amount_received: amountReceived,
        service_time_sec: state.posTimerSec,
        prescription_ref: rxRef,
        cashier_name: getActiveCashier(),
        items: state.cart.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity
        }))
      })
    });

    state.cart = [];
    state.posTimerSec = 14;
    document.getElementById('pos-rx-input').value = '';
    document.getElementById('pos-amount-received').value = '';

    await loadAllData();
    showReceiptModal(createdSale);
    showToast(`Venta ${createdSale.ticket_number} registrada y stock descontado en tiempo real.`);
  } catch (err) {
    showPosError(err.message);
  }
}

// ==========================================
// RENDERIZADO VISTA 3: INVENTARIO CENTRALIZADO
// ==========================================
function renderInventoryTable() {
  const tbody = document.getElementById('inv-table-tbody');
  if (!tbody) return;

  const q = (document.getElementById('inv-search-input')?.value || '').trim().toLowerCase();
  const cat = document.getElementById('inv-category-filter')?.value || 'ALL';
  const st = document.getElementById('inv-status-filter')?.value || 'ALL';

  const filtered = state.products.filter(p => {
    const matchCat = cat === 'ALL' || p.category === cat;
    const matchText = !q ||
      p.name.toLowerCase().includes(q) ||
      p.active_ingredient.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.laboratory.toLowerCase().includes(q) ||
      p.location.toLowerCase().includes(q);

    let matchStatus = true;
    if (st === 'CRITICAL') matchStatus = p.stock_status === 'AGOTADO' || p.stock_status === 'STOCK_BAJO';
    else if (st === 'AGOTADO') matchStatus = p.stock_status === 'AGOTADO';
    else if (st === 'STOCK_BAJO') matchStatus = p.stock_status === 'STOCK_BAJO';
    else if (st === 'FEFO') matchStatus = p.expiry_status !== 'VIGENTE';
    else if (st === 'OPTIMO') matchStatus = p.stock_status === 'OPTIMO';

    return matchCat && matchText && matchStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center;padding:var(--space-6);color:var(--color-text-muted);">
          No se encontraron medicamentos con los filtros seleccionados.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const pct = Math.min(100, Math.round((p.stock / Math.max(1, p.min_stock * 2)) * 100));
    const barColor = p.stock_status === 'AGOTADO'
      ? 'var(--color-danger)'
      : (p.stock_status === 'STOCK_BAJO' ? 'var(--color-warning)' : 'var(--color-success)');

    const fefoTag = p.expiry_status !== 'VIGENTE'
      ? `<span class="badge badge-warning" style="margin-top:3px;">Vence en ${p.days_to_expiry}d (FEFO)</span>`
      : `<span style="font-size:var(--text-xs);color:var(--color-text-muted);">Vigente (${p.days_to_expiry}d)</span>`;

    return `
      <tr data-testid="inv-row-${p.id}">
        <td>
          <div class="mono-val" style="font-weight:700;">${escapeHtml(p.sku)}</div>
          <div style="font-size:var(--text-xs);color:var(--color-text-muted);">${escapeHtml(p.location)}</div>
          <div class="mono-val" style="color:var(--color-text-faint);">DIGEMID: ${escapeHtml(p.digemid_reg)}</div>
        </td>
        <td>
          <div style="font-weight:700;">${escapeHtml(p.name)}</div>
          <div style="font-size:var(--text-xs);color:var(--color-text-muted);">${escapeHtml(p.active_ingredient)}</div>
          <div style="font-size:var(--text-xs);color:var(--color-text-muted);">${escapeHtml(p.presentation)} ${p.requires_prescription ? '· <strong>[Con Receta Rx]</strong>' : '· [Venta Libre]'}</div>
        </td>
        <td>
          <div style="font-weight:600;font-size:var(--text-xs);">${escapeHtml(p.category)}</div>
          <div style="font-size:var(--text-xs);color:var(--color-text-muted);">${escapeHtml(p.laboratory)}</div>
        </td>
        <td>
          <div class="mono-val" style="font-weight:600;">Lote: ${escapeHtml(p.batch_code)}</div>
          <div class="mono-val" style="color:var(--color-text-muted);">Vence: ${escapeHtml(p.expiry_date)}</div>
          <div>${fefoTag}</div>
        </td>
        <td>
          <div class="mono-val" style="font-weight:700;font-size:var(--text-sm);">${formatMoney(p.sale_price)}</div>
          <div class="mono-val" style="color:var(--color-text-muted);">Costo: ${formatMoney(p.cost_price)}</div>
        </td>
        <td>
          <div class="mono-val"><strong>${p.stock}</strong> unid. <span style="color:var(--color-text-muted);">/ mín. ${p.min_stock}</span></div>
          <div class="stock-meter">
            <div class="stock-meter-fill" style="width:${pct}%;background:${barColor};"></div>
          </div>
        </td>
        <td>${getStockBadgeHtml(p)}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="btn btn-primary btn-sm" onclick="openRestockModal(${p.id})" data-testid="inv-restock-${p.id}">
              + Stock
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="openEditProductModal(${p.id})" data-testid="inv-edit-${p.id}">
              Editar
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================
// RENDERIZADO VISTA 4: CENTRO DE ALERTAS Y REPOSICIÓN
// ==========================================
function renderAlertsView() {
  if (!state.alerts) return;
  const { out_of_stock, low_stock, fefo_alerts, restock_orders, summary } = state.alerts;

  document.getElementById('alert-kpi-out').textContent = `${summary.out_count} SKUs`;
  document.getElementById('alert-kpi-low').textContent = `${summary.low_count} SKUs`;
  document.getElementById('alert-kpi-fefo').textContent = `${summary.fefo_count} lotes`;
  document.getElementById('alert-kpi-budget').textContent = formatMoney(summary.total_Estimated_restock_cost);

  const combinedStockAlerts = [...out_of_stock, ...low_stock];
  const stockTbody = document.getElementById('alerts-stock-tbody');

  if (combinedStockAlerts.length === 0) {
    stockTbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center;padding:var(--space-6);color:var(--color-success);font-weight:600;">
          Excelente: No existen productos agotados ni debajo del stock mínimo en este momento.
        </td>
      </tr>
    `;
  } else {
    stockTbody.innerHTML = combinedStockAlerts.map(p => {
      const estCost = p.suggested_restock * p.cost_price;
      const sevBadge = p.stock <= 0
        ? `<span class="badge badge-danger">URGENTE · Quiebre (0)</span>`
        : `<span class="badge badge-warning">PREVENTIVA · Stock Bajo</span>`;

      return `
        <tr>
          <td class="mono-val" style="font-weight:700;">${escapeHtml(p.sku)}</td>
          <td>
            <div style="font-weight:700;">${escapeHtml(p.name)}</div>
            <div style="font-size:var(--text-xs);color:var(--color-text-muted);">${escapeHtml(p.laboratory)} · ${escapeHtml(p.location)}</div>
          </td>
          <td class="mono-val" style="font-weight:700;color:${p.stock <= 0 ? 'var(--color-danger)' : 'var(--color-warning)'};">${p.stock} unid.</td>
          <td class="mono-val">${p.min_stock} unid.</td>
          <td class="mono-val" style="font-weight:700;">+${p.suggested_restock} unid.</td>
          <td class="mono-val">${formatMoney(estCost)}</td>
          <td>${sevBadge}</td>
          <td>
            <div style="display:flex;gap:6px;">
              <button type="button" class="btn btn-primary btn-sm" onclick="openRestockModal(${p.id})" data-testid="alert-restock-${p.id}">
                Reabastecer Ahora
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="openAlternativesModal(${p.id})">
                Sustitutos
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Tabla FEFO
  const fefoTbody = document.getElementById('alerts-fefo-tbody');
  if (fefo_alerts.length === 0) {
    fefoTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:var(--space-4);color:var(--color-text-muted);">Sin lotes próximos a vencer en 90 días.</td></tr>`;
  } else {
    fefoTbody.innerHTML = fefo_alerts.map(p => `
      <tr>
        <td>
          <div style="font-weight:700;">${escapeHtml(p.name)}</div>
          <div class="mono-val" style="color:var(--color-text-muted);">${escapeHtml(p.sku)}</div>
        </td>
        <td class="mono-val">
          <div>${escapeHtml(p.batch_code)}</div>
          <div style="color:var(--color-text-muted);">${escapeHtml(p.expiry_date)}</div>
        </td>
        <td><span class="badge badge-warning">${p.days_to_expiry} días</span></td>
        <td class="mono-val">${p.stock} unid.</td>
        <td>
          <button type="button" class="btn btn-secondary btn-sm" onclick="switchView('pos'); addToCart(${p.id});">
            Priorizar en POS
          </button>
        </td>
      </tr>
    `).join('');
  }

  // Tabla de órdenes de reposición emitidas
  const ordersTbody = document.getElementById('alerts-orders-tbody');
  if (restock_orders.length === 0) {
    ordersTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:var(--space-4);">Sin órdenes registradas.</td></tr>`;
  } else {
    ordersTbody.innerHTML = restock_orders.slice(0, 8).map(o => `
      <tr>
        <td class="mono-val" style="font-weight:700;">${escapeHtml(o.order_code)}</td>
        <td>
          <div style="font-weight:600;">${escapeHtml(o.product_name)}</div>
          <div style="font-size:var(--text-xs);color:var(--color-text-muted);">${escapeHtml(o.supplier)}</div>
        </td>
        <td class="mono-val" style="color:var(--color-success);font-weight:700;">+${o.quantity_ordered}</td>
        <td class="mono-val">${formatMoney(o.total_cost)}</td>
        <td class="mono-val">${escapeHtml(o.batch_received)}</td>
      </tr>
    `).join('');
  }
}

// ==========================================
// RENDERIZADO VISTA 5: VENTAS, KARDEX Y CLIENTES
// ==========================================
function renderRecordsView() {
  // 5A: Ventas
  const salesTbody = document.getElementById('records-sales-tbody');
  if (salesTbody) {
    salesTbody.innerHTML = state.sales.map(s => {
      const isCancelled = s.status === 'ANULADA';
      const statusBadge = isCancelled
        ? `<span class="badge badge-danger">ANULADA</span>`
        : `<span class="badge badge-success">COMPLETADA</span>`;

      return `
        <tr data-testid="sale-row-${s.id}">
          <td>
            <div class="mono-val" style="font-weight:700;">${escapeHtml(s.ticket_number)}</div>
            <div style="font-size:var(--text-xs);color:var(--color-text-muted);">${escapeHtml(s.voucher_type)}</div>
          </td>
          <td class="mono-val">${escapeHtml(s.created_at)}</td>
          <td>
            <div style="font-weight:600;">${escapeHtml(s.customer_name)}</div>
            <div class="mono-val" style="color:var(--color-text-muted);">Doc: ${escapeHtml(s.customer_doc)} ${s.prescription_ref ? `· Rx: ${escapeHtml(s.prescription_ref)}` : ''}</div>
          </td>
          <td>${escapeHtml(s.payment_method)}</td>
          <td><span class="badge badge-info mono-val">${s.service_time_sec} seg</span></td>
          <td class="mono-val" style="font-weight:700;">${formatMoney(s.total)}</td>
          <td>${statusBadge}</td>
          <td>
            <div style="display:flex;gap:6px;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="viewReceiptById(${s.id})" data-testid="btn-view-sale-${s.id}">
                Ver Ticket
              </button>
              ${!isCancelled ? `
                <button type="button" class="btn btn-danger btn-sm" onclick="openCancelSaleModal(${s.id})" data-testid="btn-cancel-sale-${s.id}">
                  Anular
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 5B: Kardex
  const kardexTbody = document.getElementById('records-kardex-tbody');
  if (kardexTbody) {
    kardexTbody.innerHTML = state.kardex.map(m => {
      const isPositive = m.quantity_change >= 0;
      const sign = isPositive ? `+${m.quantity_change}` : `${m.quantity_change}`;
      const badgeClass = m.movement_type === 'VENTA'
        ? 'badge-info'
        : (m.movement_type === 'REPOSICION' ? 'badge-success' : (m.movement_type === 'ANULACION_VENTA' ? 'badge-danger' : 'badge-warning'));

      return `
        <tr>
          <td class="mono-val">${escapeHtml(m.created_at)}</td>
          <td><span class="badge ${badgeClass}">${escapeHtml(m.movement_type)}</span></td>
          <td>
            <div style="font-weight:600;">${escapeHtml(m.product_name)}</div>
            <div class="mono-val" style="color:var(--color-text-muted);">${escapeHtml(m.sku)}</div>
          </td>
          <td class="mono-val" style="font-weight:700;color:${isPositive ? 'var(--color-success)' : 'var(--color-danger)'};">
            ${sign} unid.
          </td>
          <td class="mono-val">${m.previous_stock} → <strong>${m.new_stock}</strong></td>
          <td class="mono-val">${escapeHtml(m.batch_code)}</td>
          <td class="mono-val" style="font-weight:600;">${escapeHtml(m.reference_doc)}</td>
          <td>
            <div style="font-weight:600;font-size:var(--text-xs);">${escapeHtml(m.responsible)}</div>
            <div style="font-size:var(--text-xs);color:var(--color-text-muted);">${escapeHtml(m.notes)}</div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 5C: Clientes
  const custTbody = document.getElementById('records-customers-tbody');
  if (custTbody) {
    custTbody.innerHTML = state.customers.map(c => `
      <tr>
        <td class="mono-val"><strong>${escapeHtml(c.doc_type)}</strong>: ${escapeHtml(c.doc_number)}</td>
        <td style="font-weight:700;">${escapeHtml(c.full_name)}</td>
        <td style="font-size:var(--text-xs);">
          <div>${escapeHtml(c.phone || '-')}</div>
          <div style="color:var(--color-text-muted);">${escapeHtml(c.email || '-')}</div>
        </td>
        <td>
          <span class="badge ${c.allergies_notes.toLowerCase().includes('alergia') ? 'badge-danger' : 'badge-neutral'}">
            ${escapeHtml(c.allergies_notes)}
          </span>
        </td>
        <td class="mono-val">${c.total_purchases}</td>
        <td class="mono-val" style="font-weight:700;">${formatMoney(c.total_spent)}</td>
        <td><span class="badge badge-success mono-val">${c.loyalty_points} pts</span></td>
      </tr>
    `).join('');
  }
}

// ==========================================
// ACCIONES DE MODALES (REPOSICIÓN, PRODUCTO, SUSTITUTOS, RECIBO, ANULACIÓN)
// ==========================================
window.openRestockModal = function (productId) {
  const prod = state.products.find(p => p.id === Number(productId));
  if (!prod) return;

  document.getElementById('restock-product-id').value = prod.id;
  document.getElementById('restock-product-name').textContent = `${prod.sku} — ${prod.name}`;
  document.getElementById('restock-product-meta').textContent =
    `Stock actual: ${prod.stock} unid. | Stock mínimo: ${prod.min_stock} unid. | Costo unitario: ${formatMoney(prod.cost_price)}`;
  document.getElementById('restock-qty').value = prod.suggested_restock || 30;
  document.getElementById('restock-batch').value = `LT-2026-${Math.floor(100 + Math.random() * 899)}`;
  document.getElementById('restock-expiry').value = '2028-05-30';

  openModal('modal-restock');
};

window.openEditProductModal = function (productId) {
  const prod = state.products.find(p => p.id === Number(productId));
  if (!prod) return;

  document.getElementById('modal-product-title').textContent = `Editar Medicamento / Ajuste de Stock (${prod.sku})`;
  document.getElementById('prod-id').value = prod.id;
  document.getElementById('prod-sku').value = prod.sku;
  document.getElementById('prod-sku').disabled = true;
  document.getElementById('prod-name').value = prod.name;
  document.getElementById('prod-dci').value = prod.active_ingredient;
  document.getElementById('prod-category').value = prod.category;
  document.getElementById('prod-lab').value = prod.laboratory;
  document.getElementById('prod-presentation').value = prod.presentation;
  document.getElementById('prod-location').value = prod.location;
  document.getElementById('prod-digemid').value = prod.digemid_reg;
  document.getElementById('prod-batch').value = prod.batch_code;
  document.getElementById('prod-expiry').value = prod.expiry_date;
  document.getElementById('prod-cost').value = prod.cost_price;
  document.getElementById('prod-price').value = prod.sale_price;
  document.getElementById('prod-stock').value = prod.stock;
  document.getElementById('prod-min-stock').value = prod.min_stock;
  document.getElementById('prod-indications').value = prod.indications;
  document.getElementById('prod-rx').checked = Boolean(prod.requires_prescription);

  openModal('modal-product');
};

function openNewProductModal() {
  const nextNum = state.products.length + 1;
  document.getElementById('modal-product-title').textContent = 'Registrar Nuevo Medicamento en Inventario Central';
  document.getElementById('prod-id').value = '';
  document.getElementById('prod-sku').value = `MED-${String(nextNum).padStart(3, '0')}`;
  document.getElementById('prod-sku').disabled = false;
  document.getElementById('prod-name').value = '';
  document.getElementById('prod-dci').value = '';
  document.getElementById('prod-category').value = 'Analgésicos y Antipiréticos';
  document.getElementById('prod-lab').value = 'Medifarma S.A.';
  document.getElementById('prod-presentation').value = 'Caja x 20 tabletas';
  document.getElementById('prod-location').value = `Anaquel A-${String(nextNum).padStart(2, '0')}`;
  document.getElementById('prod-digemid').value = `EN-0${4500 + nextNum}`;
  document.getElementById('prod-batch').value = `LT-26N${nextNum}`;
  document.getElementById('prod-expiry').value = '2028-03-31';
  document.getElementById('prod-cost').value = '10.50';
  document.getElementById('prod-price').value = '16.90';
  document.getElementById('prod-stock').value = '25';
  document.getElementById('prod-min-stock').value = '10';
  document.getElementById('prod-indications').value = 'Alivio sintomático de dolor y fiebre';
  document.getElementById('prod-rx').checked = false;

  openModal('modal-product');
}

window.openAlternativesModal = async function (productId) {
  try {
    const data = await apiFetch(`/api/products/${productId}/alternatives`);
    const body = document.getElementById('modal-alt-body');

    const bioHtml = data.bioequivalents.length > 0
      ? data.bioequivalents.map(b => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);padding:var(--space-3);background:var(--color-success-bg);border:1px solid var(--color-success-border);border-radius:var(--radius-md);margin-bottom:var(--space-2);">
            <div>
              <div style="font-weight:700;">${escapeHtml(b.name)} (${escapeHtml(b.sku)})</div>
              <div style="font-size:var(--text-xs);">${escapeHtml(b.active_ingredient)} · ${escapeHtml(b.laboratory)}</div>
              <div class="mono-val" style="font-size:var(--text-xs);">Stock disponible: <strong>${b.stock} unid.</strong> · Ubicación: ${escapeHtml(b.location)}</div>
            </div>
            <div style="text-align:right;">
              <div class="mono-val" style="font-weight:700;font-size:var(--text-base);">${formatMoney(b.sale_price)}</div>
              <button type="button" class="btn btn-primary btn-sm" style="margin-top:4px;" onclick="closeModal('modal-alternatives'); switchView('pos'); addToCart(${b.id});">
                + Dispensar en POS
              </button>
            </div>
          </div>
        `).join('')
      : `<p style="font-size:var(--text-xs);color:var(--color-text-muted);margin-bottom:var(--space-3);">No hay otro medicamento con idéntico principio activo en stock, revise las alternativas de la misma categoría terapéutica abajo.</p>`;

    const catHtml = data.same_category.map(c => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);padding:var(--space-3);background:var(--color-surface-2);border:1px solid var(--color-border);border-radius:var(--radius-md);margin-bottom:var(--space-2);">
        <div>
          <div style="font-weight:700;">${escapeHtml(c.name)}</div>
          <div style="font-size:var(--text-xs);color:var(--color-text-muted);">${escapeHtml(c.active_ingredient)} · Stock: ${c.stock} unid.</div>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-2);">
          <span class="mono-val" style="font-weight:700;">${formatMoney(c.sale_price)}</span>
          <button type="button" class="btn btn-secondary btn-sm" onclick="closeModal('modal-alternatives'); switchView('pos'); addToCart(${c.id});">
            + Agregar
          </button>
        </div>
      </div>
    `).join('');

    body.innerHTML = `
      <div style="background:var(--color-surface-2);padding:var(--space-3);border-radius:var(--radius-md);margin-bottom:var(--space-4);border:1px solid var(--color-border);">
        <div style="font-size:var(--text-xs);color:var(--color-text-muted);">Producto consultado:</div>
        <div style="font-weight:700;">${escapeHtml(data.target.name)} (Stock actual: ${data.target.stock} unid.)</div>
        <div style="font-size:var(--text-xs);">Principio Activo (DCI): <strong>${escapeHtml(data.target.active_ingredient)}</strong></div>
      </div>
      <h3 style="font-size:var(--text-sm);margin-bottom:var(--space-2);">1. Bioequivalentes Directos (Mismo Principio Activo DCI):</h3>
      ${bioHtml}
      <h3 style="font-size:var(--text-sm);margin:var(--space-3) 0 var(--space-2);">2. Alternativas de la Categoría (${escapeHtml(data.target.category)}):</h3>
      ${catHtml}
    `;

    openModal('modal-alternatives');
  } catch (err) {
    showToast(err.message, 'danger');
  }
};

window.viewReceiptById = function (saleId) {
  const sale = state.sales.find(s => s.id === Number(saleId));
  if (!sale) return;
  showReceiptModal(sale);
};

function showReceiptModal(sale) {
  state.lastReceipt = sale;
  const box = document.getElementById('receipt-content');
  const itemsRows = (sale.items || []).map(i => `
    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
      <span>${i.quantity}x ${escapeHtml(i.product_name)} [Lote:${escapeHtml(i.batch_code)}]</span>
      <span>${formatMoney(i.line_total)}</span>
    </div>
  `).join('');

  box.innerHTML = `
    <div style="text-align:center;border-bottom:1px dashed var(--color-border);padding-bottom:10px;margin-bottom:10px;">
      <div style="font-weight:700;font-size:14px;">BOTICA NOVA SALUD · RED FARMAPLUS</div>
      <div>Av. Comercial 480, Lima · RUC: 20609481023</div>
      <div style="font-weight:700;margin-top:4px;">${escapeHtml(sale.voucher_type.toUpperCase())}: ${escapeHtml(sale.ticket_number)}</div>
      <div>Estado: <strong>${escapeHtml(sale.status)}</strong></div>
    </div>
    <div style="margin-bottom:10px;line-height:1.5;">
      <div><strong>Fecha/Hora:</strong> ${escapeHtml(sale.created_at)}</div>
      <div><strong>Cliente:</strong> ${escapeHtml(sale.customer_name)}</div>
      <div><strong>Documento:</strong> ${escapeHtml(sale.customer_doc)}</div>
      <div><strong>Atendido por:</strong> ${escapeHtml(sale.cashier_name)}</div>
      <div><strong>Tiempo de Atención:</strong> ${sale.service_time_sec} segundos</div>
      ${sale.prescription_ref ? `<div><strong>Receta / CMP Validado:</strong> ${escapeHtml(sale.prescription_ref)}</div>` : ''}
    </div>
    <div style="border-top:1px dashed var(--color-border);border-bottom:1px dashed var(--color-border);padding:8px 0;margin-bottom:10px;">
      <div style="font-weight:700;margin-bottom:6px;">DETALLE DE MEDICAMENTOS DISPENSADOS:</div>
      ${itemsRows}
    </div>
    <div style="display:flex;justify-content:space-between;"><span>OP. GRAVADA (SUBTOTAL):</span><span>${formatMoney(sale.subtotal)}</span></div>
    <div style="display:flex;justify-content:space-between;"><span>I.G.V. (18%):</span><span>${formatMoney(sale.igv)}</span></div>
    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;margin-top:4px;"><span>TOTAL IMPORTE:</span><span>${formatMoney(sale.total)}</span></div>
    <div style="display:flex;justify-content:space-between;margin-top:6px;"><span>Medio de Pago (${escapeHtml(sale.payment_method)}):</span><span>${formatMoney(sale.amount_received)}</span></div>
    <div style="display:flex;justify-content:space-between;"><span>Vuelto Entregado:</span><span>${formatMoney(sale.change_given)}</span></div>
  `;

  openModal('modal-receipt');
}

window.openCancelSaleModal = function (saleId) {
  const sale = state.sales.find(s => s.id === Number(saleId));
  if (!sale) return;
  document.getElementById('cancel-sale-id').value = sale.id;
  document.getElementById('cancel-sale-summary').textContent =
    `Se anulará el comprobante ${sale.ticket_number} (${formatMoney(sale.total)}) de ${sale.customer_name} y todas las unidades vendidas retornarán automáticamente al stock de la botica.`;
  openModal('modal-cancel-sale');
};

// Descarga de archivos generados (CSV y TXT) mediante Blob
function downloadTextFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function exportInventoryCsv() {
  let csv = '\uFEFFSKU,Medicamento,Principio Activo,Categoria,Laboratorio,Ubicacion,Lote,Vencimiento,Stock Actual,Stock Minimo,Estado,Precio Venta (S/)\n';
  state.products.forEach(p => {
    csv += `"${p.sku}","${p.name}","${p.active_ingredient}","${p.category}","${p.laboratory}","${p.location}","${p.batch_code}","${p.expiry_date}",${p.stock},${p.min_stock},"${p.stock_status}",${p.sale_price.toFixed(2)}\n`;
  });
  downloadTextFile('inventario_nova_salud.csv', csv, 'text/csv;charset=utf-8');
  showToast('Reporte CSV de Inventario descargado.');
}

function exportSalesCsv() {
  let csv = '\uFEFFComprobante,Tipo,Cliente,Documento,Metodo Pago,Subtotal,IGV,Total,Tiempo Atencion (seg),Estado,Fecha\n';
  state.sales.forEach(s => {
    csv += `"${s.ticket_number}","${s.voucher_type}","${s.customer_name}","${s.customer_doc}","${s.payment_method}",${s.subtotal.toFixed(2)},${s.igv.toFixed(2)},${s.total.toFixed(2)},${s.service_time_sec},"${s.status}","${s.created_at}"\n`;
  });
  downloadTextFile('ventas_nova_salud.csv', csv, 'text/csv;charset=utf-8');
  showToast('Reporte CSV de Ventas descargado.');
}

function exportKardexCsv() {
  let csv = '\uFEFFFecha,Tipo Movimiento,SKU,Medicamento,Variacion,Stock Anterior,Stock Nuevo,Lote,Referencia,Responsable\n';
  state.kardex.forEach(m => {
    csv += `"${m.created_at}","${m.movement_type}","${m.sku}","${m.product_name}",${m.quantity_change},${m.previous_stock},${m.new_stock},"${m.batch_code}","${m.reference_doc}","${m.responsible}"\n`;
  });
  downloadTextFile('kardex_auditoria_nova_salud.csv', csv, 'text/csv;charset=utf-8');
  showToast('Reporte CSV de Kardex descargado.');
}

// ==========================================
// INICIALIZACIÓN DE EVENTOS DOM
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // Navegación principal (Sidebar + Móvil)
  document.querySelectorAll('[data-nav-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.getAttribute('data-nav-target'));
    });
  });

  // Botones de salto rápido en Dashboard
  document.querySelectorAll('[data-jump-view], [data-Jump-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-jump-view') || btn.getAttribute('data-Jump-view');
      switchView(target);
    });
  });

  document.getElementById('quick-pos-btn')?.addEventListener('click', () => switchView('pos'));
  document.getElementById('dash-go-alerts-btn')?.addEventListener('click', () => switchView('alerts'));

  // Reabastecimiento masivo de críticos en 1 clic
  async function handleBulkRestock() {
    try {
      const res = await apiFetch('/api/products/restock-all-critical', { method: 'POST' });
      await loadAllData();
      showToast(res.message || 'Productos críticos reabastecidos.');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  document.getElementById('dash-restock-all-btn')?.addEventListener('click', handleBulkRestock);
  document.getElementById('alerts-bulk-restock-btn')?.addEventListener('click', handleBulkRestock);

  // Cambio de Tema Claro / Oscuro
  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    const btn = document.getElementById('theme-toggle-btn');
    btn.innerHTML = state.theme === 'dark' ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
    refreshIcons();
    if (state.dashboard) {
      renderDashboardCharts(state.dashboard.charts);
    }
  });

  // Eventos del Punto de Venta (POS)
  document.getElementById('pos-search-input')?.addEventListener('input', renderPosCatalog);
  document.getElementById('pos-category-filter')?.addEventListener('change', renderPosCatalog);

  document.querySelectorAll('.pos-symptom-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const symptom = chip.getAttribute('data-symptom') || '';
      const input = document.getElementById('pos-search-input');
      if (input) {
        input.value = symptom;
        renderPosCatalog();
      }
    });
  });

  document.getElementById('pos-customer-select')?.addEventListener('change', updateCustomerAllergyBanner);
  document.getElementById('pos-amount-received')?.addEventListener('input', () => updateCashChangeDisplay());
  document.getElementById('pos-clear-cart-btn')?.addEventListener('click', () => {
    state.cart = [];
    state.posTimerSec = 10;
    hidePosError();
    renderCart();
  });
  document.getElementById('pos-submit-sale-btn')?.addEventListener('click', submitPosSale);

  // Filtros de Inventario
  document.getElementById('inv-search-input')?.addEventListener('input', renderInventoryTable);
  document.getElementById('inv-category-filter')?.addEventListener('change', renderInventoryTable);
  document.getElementById('inv-status-filter')?.addEventListener('change', renderInventoryTable);
  document.getElementById('inv-new-product-btn')?.addEventListener('click', openNewProductModal);
  document.getElementById('inv-export-csv-btn')?.addEventListener('click', exportInventoryCsv);

  // Sub-pestañas en Ventas, Clientes y Kardex
  document.querySelectorAll('[data-record-tab]').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      const tab = tabBtn.getAttribute('data-record-tab');
      state.currentRecordTab = tab;
      document.querySelectorAll('[data-record-tab]').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-record-tab') === tab);
      });
      document.getElementById('subview-sales').style.display = tab === 'sales' ? 'block' : 'none';
      document.getElementById('subview-kardex').style.display = tab === 'kardex' ? 'block' : 'none';
      document.getElementById('subview-customers').style.display = tab === 'customers' ? 'block' : 'none';
    });
  });

  document.getElementById('export-sales-btn')?.addEventListener('click', exportSalesCsv);
  document.getElementById('export-kardex-btn')?.addEventListener('click', exportKardexCsv);

  // Cerrar modales
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close-modal')));
  });

  // Formulario Modal 1: Reabastecer Producto
  document.getElementById('form-restock')?.addEventListener('submit', async e => {
    e.preventDefault();
    const prodId = Number(document.getElementById('restock-product-id').value);
    const qty = Number(document.getElementById('restock-qty').value);
    const supplier = document.getElementById('restock-supplier').value;
    const batch = document.getElementById('restock-batch').value;
    const expiry = document.getElementById('restock-expiry').value;

    try {
      const res = await apiFetch(`/api/products/${prodId}/restock`, {
        method: 'POST',
        body: JSON.stringify({
          quantity: qty,
          supplier,
          batch_code: batch,
          expiry_date: expiry,
          responsible: getActiveCashier()
        })
      });
      closeModal('modal-restock');
      await loadAllData();
      showToast(`Orden ${res.order_code}: +${res.quantity_added} unidades ingresadas a inventario.`);
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  // Formulario Modal 2: Crear / Editar Medicamento
  document.getElementById('form-product')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('prod-id').value;
    const payload = {
      sku: document.getElementById('prod-sku').value,
      name: document.getElementById('prod-name').value,
      active_ingredient: document.getElementById('prod-dci').value,
      category: document.getElementById('prod-category').value,
      laboratory: document.getElementById('prod-lab').value,
      presentation: document.getElementById('prod-presentation').value,
      location: document.getElementById('prod-location').value,
      digemid_reg: document.getElementById('prod-digemid').value,
      batch_code: document.getElementById('prod-batch').value,
      expiry_date: document.getElementById('prod-expiry').value,
      cost_price: Number(document.getElementById('prod-cost').value),
      sale_price: Number(document.getElementById('prod-price').value),
      stock: Number(document.getElementById('prod-stock').value),
      min_stock: Number(document.getElementById('prod-min-stock').value),
      indications: document.getElementById('prod-indications').value,
      requires_prescription: document.getElementById('prod-rx').checked,
      responsible: getActiveCashier()
    };

    try {
      if (id) {
        await apiFetch(`/api/products/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showToast('Medicamento actualizado y registrado en Kardex.');
      } else {
        await apiFetch('/api/products', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast('Nuevo medicamento incorporado al inventario centralizado.');
      }
      closeModal('modal-product');
      await loadAllData();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  // Formulario Modal 4: Nuevo Cliente
  document.getElementById('pos-new-customer-btn')?.addEventListener('click', () => openModal('modal-customer'));
  document.getElementById('records-add-customer-btn')?.addEventListener('click', () => openModal('modal-customer'));

  document.getElementById('form-customer')?.addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      doc_type: document.getElementById('cust-doc-type').value,
      doc_number: document.getElementById('cust-doc-num').value,
      full_name: document.getElementById('cust-name').value,
      phone: document.getElementById('cust-phone').value,
      allergies_notes: document.getElementById('cust-allergies').value || 'Ninguna registrada'
    };

    try {
      const created = await apiFetch('/api/customers', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      closeModal('modal-customer');
      document.getElementById('form-customer').reset();
      await loadAllData();
      const posSel = document.getElementById('pos-customer-select');
      if (posSel) {
        posSel.value = String(created.id);
        updateCustomerAllergyBanner();
      }
      showToast(`Cliente ${created.full_name} registrado exitosamente.`);
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  // Descargar Ticket en TXT desde Modal 5
  document.getElementById('download-receipt-txt-btn')?.addEventListener('click', () => {
    if (!state.lastReceipt) return;
    const s = state.lastReceipt;
    const lines = [
      '================================================',
      '       BOTICA NOVA SALUD - RED FARMAPLUS        ',
      '     Av. Comercial 480, Lima - RUC 20609481023  ',
      '================================================',
      `${s.voucher_type}: ${s.ticket_number}`,
      `Fecha: ${s.created_at}`,
      `Cliente: ${s.customer_name} (${s.customer_doc})`,
      `Atendido por: ${s.cashier_name}`,
      `Tiempo de atencion: ${s.service_time_sec} seg`,
      '------------------------------------------------',
      ...(s.items || []).map(i => `${i.quantity}x ${i.product_name} (${formatMoney(i.line_total)})`),
      '------------------------------------------------',
      `SUBTOTAL (OP. GRAVADA): ${formatMoney(s.subtotal)}`,
      `IGV (18%):              ${formatMoney(s.igv)}`,
      `TOTAL PAGADO:           ${formatMoney(s.total)}`,
      `Medio de Pago:          ${s.payment_method}`,
      '================================================'
    ].join('\n');
    downloadTextFile(`comprobante_${s.ticket_number}.txt`, lines);
  });

  // Formulario Modal 6: Confirmar Anulación de Venta
  document.getElementById('form-cancel-sale')?.addEventListener('submit', async e => {
    e.preventDefault();
    const saleId = Number(document.getElementById('cancel-sale-id').value);
    const reason = document.getElementById('cancel-sale-reason').value;
    try {
      const res = await apiFetch(`/api/sales/${saleId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({
          reason,
          responsible: getActiveCashier()
        })
      });
      closeModal('modal-cancel-sale');
      await loadAllData();
      showToast(`Comprobante ${res.ticket_number} anulado y stock devuelto al almacén.`);
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  startPosTimer();
  loadAllData();
});
