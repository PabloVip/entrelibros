// Web del back-office ERP/CRM de Entrelibros (Tarea 2).
// Lee SOLO su propio proyecto de Supabase (config.js) con la sesión del personal: las políticas RLS
// le dejan leer y nada más. Las escrituras las hace n8n con la clave secreta de este proyecto.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { ERP_URL, ERP_PUBLISHABLE_KEY, SHOP_URL } from './config.js';

const db = createClient(ERP_URL, ERP_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'entrelibros-erp-auth' },
});

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => Number(v ?? 0);
const money = v => num(v).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const fmtDate = v => v ? new Date(v).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const pct = (a, b) => (b ? Math.round((num(a) / num(b)) * 1000) / 10 : 0);
const LABEL = {
  pendiente_pago: 'Pendiente de pago', pagado: 'Pagado', en_preparacion: 'En preparación', enviado: 'Enviado',
  entregado: 'Entregado', cancelado: 'Cancelado', incidencia: 'Incidencia', pendiente: 'Pendiente', rechazado: 'Rechazado',
  nuevo: 'Nuevo', en_curso: 'En curso', esperando_cliente: 'Esperando al cliente', resuelto: 'Resuelto',
  baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente',
  pendiente_revision: 'Pendiente de revisión', aprobado: 'Aprobada', ejecutado_simulado: 'Aprobada (sin chat)',
  caducado: 'Caducada', ok: 'Correcto', error: 'Error', duplicado: 'Duplicado', obsoleto: 'Obsoleto', ignorado: 'Ignorado',
  contrato: 'Contrato', formato: 'Formato', coherencia: 'Coherencia', negocio: 'Negocio', tecnico: 'Técnico',
  agente: 'Agente IA', autenticacion: 'Autenticación', evento: 'Evento', carga_inicial: 'Carga inicial',
};
const TONE = {
  pagado: 'ok', entregado: 'ok', enviado: 'ok', resuelto: 'ok', ok: 'ok', aprobado: 'ok', enviado_cliente: 'ok',
  ejecutado_simulado: 'ok', pendiente_pago: 'warn', pendiente: 'warn', nuevo: 'warn', pendiente_revision: 'warn',
  en_curso: 'info', en_preparacion: 'info', esperando_cliente: 'info', duplicado: 'info', obsoleto: 'info',
  error: 'bad', rechazado: 'bad', cancelado: 'bad', alta: 'bad', urgente: 'bad', media: 'warn', baja: 'info',
};
const label = k => LABEL[k] ?? k;
const pill = (k, text = label(k)) => `<span class="pill ${TONE[k] ?? ''}">${esc(text)}</span>`;

const TITLES = {
  mando: ['Cuadro de mando', 'Métricas calculadas en el momento a partir de las tablas de este sistema.'],
  pedidos: ['Pedidos de venta', 'Pedidos recibidos de la tienda por la integración, con su historial de estados en el ERP.'],
  inventario: ['Inventario', 'Stock por SKU: carga inicial desde la tienda y ajustes recibidos como eventos.'],
  clientes: ['Clientes', 'Fichas creadas a partir de los pedidos y las incidencias recibidas.'],
  incidencias: ['Incidencias (CRM)', 'Tickets enlazados a cliente y pedido, con su actividad (alta, notas, propuestas, revisión, mensajes).'],
  agente: ['Agente de IA', 'Propuestas estructuradas del agente y la decisión de la persona que revisa en Telegram.'],
  registro: ['Registro de integración', 'Cada paso que n8n ha aplicado en este sistema: resultado, errores y tiempos.'],
};

// ---------------------------------------------------------------- sesión
async function start() {
  $('shop-link').href = SHOP_URL;
  const { data } = await db.auth.getSession();
  if (!data.session) return showLogin();
  const { data: ok, error } = await db.rpc('is_staff');
  if (error || !ok) {
    await db.auth.signOut();
    return showLogin('Tu usuario no está dado de alta como personal del back-office.');
  }
  $('who-email').textContent = data.session.user.email;
  $('login').hidden = true;
  $('app').hidden = false;
  route();
}

function showLogin(msg = '') {
  $('app').hidden = true;
  $('login').hidden = false;
  $('login-msg').textContent = msg;
}

$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('login-msg').textContent = 'Entrando…';
  const { error } = await db.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
  if (error) { $('login-msg').textContent = 'Email o contraseña incorrectos.'; return; }
  start();
});
$('logout').addEventListener('click', async () => { await db.auth.signOut(); showLogin(); });
$('refresh').addEventListener('click', () => route());
$('days').addEventListener('change', () => route());
window.addEventListener('hashchange', () => route());

// ---------------------------------------------------------------- navegación
async function route() {
  const tab = (location.hash.slice(1) || 'mando');
  const view = TITLES[tab] ? tab : 'mando';
  document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + view ? 'page' : 'false'));
  $('title').textContent = TITLES[view][0];
  $('subtitle').textContent = TITLES[view][1];
  $('days-wrap').hidden = !['mando', 'agente'].includes(view);
  $('view').innerHTML = '<p class="muted">Cargando…</p>';
  try {
    $('view').innerHTML = await VIEWS[view]();
  } catch (err) {
    $('view').innerHTML = `<p class="msg">No se han podido cargar los datos: ${esc(err.message ?? err)}</p>`;
  }
}

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data ?? [];
}

const table = (head, rows, empty) => rows.length
  ? `<div class="table-wrap"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  : `<p class="empty">${esc(empty)}</p>`;

function hbars(entries, empty) {
  const max = Math.max(1, ...entries.map(e => num(e[1])));
  return entries.length
    ? `<ul class="hbars">${entries.map(([k, n, sub]) => `<li><span class="hb-label">${esc(k)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>
        <span class="hb-bar"><span style="width:${(num(n) / max) * 100}%"></span></span><strong>${esc(n)}</strong></li>`).join('')}</ul>`
    : `<p class="empty">${esc(empty)}</p>`;
}

// ---------------------------------------------------------------- vistas
const VIEWS = {
  async mando() {
    const days = Number($('days').value);
    const d = await q(db.rpc('erp_dashboard', { p_days: days }));
    const it = d.integration ?? {}, ag = d.agent ?? {}, inv = d.inventory ?? {};
    const kpi = (lbl, val, sub = '') => `<div class="kpi"><span>${esc(lbl)}</span><strong>${val}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const kpis = [
      kpi('Pedidos de venta', esc(num(d.orders))),
      kpi('Importe pagado', esc(money(d.orders_amount)), 'pagos simulados'),
      kpi('Eventos aplicados', `${pct(it.ok, it.received)} %`, `${esc(num(it.ok))} de ${esc(num(it.received))} · ${esc(num(it.duplicates))} duplicados · ${esc(num(it.obsolete))} obsoletos`),
      kpi('Errores registrados', esc(Object.values(d.errors_by_type ?? {}).reduce((s, n) => s + num(n), 0)), `${esc(num(it.error))} al aplicar eventos · resto del agente o del envío`),
      kpi('Latencia tienda → ERP', it.avg_latency_s != null ? `${esc(it.avg_latency_s)} s` : '—', 'del evento a su aplicación'),
      kpi('Incidencias abiertas', esc(num(d.open_tickets)), `resolución media: ${d.avg_resolution_h != null ? esc(d.avg_resolution_h) + ' h' : '—'}`),
      kpi('Propuestas del agente', esc(num(ag.proposals)), `${esc(num(ag.approved))} aprobadas · ${esc(num(ag.rejected))} rechazadas · ${esc(num(ag.pending))} pendientes`),
      kpi('Inventario', `${esc(num(inv.skus))} SKU`, `${esc(num(inv.units))} uds. · ${esc(num(inv.low))} con menos de 5`),
    ];

    // gráfico: pedidos por día del periodo
    const DAY = 864e5, today = new Date(new Date().toDateString());
    const buckets = Array.from({ length: days }, (_, i) => ({ date: new Date(today - (days - 1 - i) * DAY), n: 0, amount: 0 }));
    for (const r of d.orders_per_day ?? []) {
      const i = Math.round((new Date(r.day + 'T00:00:00') - buckets[0].date) / DAY);
      if (buckets[i]) { buckets[i].n = num(r.n); buckets[i].amount = num(r.amount); }
    }
    const max = Math.max(1, ...buckets.map(b => b.n));
    const fmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
    const every = days <= 7 ? 1 : days <= 30 ? 5 : 15;
    const chart = `<div class="bars" role="img" aria-label="Pedidos de venta recibidos por día">
        ${buckets.map(b => `<div class="bar" title="${esc(fmt.format(b.date))}: ${b.n} pedidos · ${esc(money(b.amount))}">${b.n ? `<em>${b.n}</em>` : ''}<span style="height:${(b.n / max) * 85}%"></span></div>`).join('')}
      </div>
      <div class="bars-axis" aria-hidden="true">${buckets.map((b, i) => `<span>${(days - 1 - i) % every === 0 ? esc(fmt.format(b.date)) : ''}</span>`).join('')}</div>`;

    return `<section class="kpis">${kpis.join('')}</section>
      <section class="card"><h2>Pedidos de venta recibidos por día</h2>
        <p class="muted">Total del periodo: <strong>${buckets.reduce((s, b) => s + b.n, 0)}</strong></p>${chart}</section>
      <div class="grid-2">
        <section class="card"><h2>Pedidos por estado</h2>${hbars(Object.entries(d.orders_by_status ?? {}).map(([k, n]) => [label(k), n]), 'Aún no hay pedidos.')}</section>
        <section class="card"><h2>Errores de integración por tipo</h2>${hbars(Object.entries(d.errors_by_type ?? {}).map(([k, n]) => [label(k), n]), 'Sin errores en el periodo.')}</section>
        <section class="card"><h2>Incidencias abiertas por prioridad</h2>${hbars(Object.entries(d.tickets_by_priority ?? {}).map(([k, n]) => [label(k), n]), 'No hay incidencias abiertas.')}</section>
        <section class="card"><h2>Productos más vendidos</h2>${hbars((d.top_products ?? []).map(p => [p.description, p.qty, p.sku]), 'Sin pedidos pagados.')}</section>
      </div>
      <p class="muted small">Confianza media declarada por el agente: ${ag.avg_confidence != null ? esc(Math.round(ag.avg_confidence * 100)) + ' %' : '—'} · ${esc(num(d.customers))} clientes en el CRM.</p>`;
  },

  async pedidos() {
    const rows = await q(db.from('sales_orders')
      .select('id, external_id, status, payment_status, payment_method, total_amount, shipping_method, delivery_point, ordered_at, updated_at, sync_version, customers(email, full_name), sales_order_lines(line_no, sku, description, quantity, unit_price, amount), sales_order_history(id, from_status, to_status, event_type, created_at)')
      .order('updated_at', { ascending: false }).limit(100));
    if (!rows.length) return '<p class="empty">Todavía no ha llegado ningún pedido de la tienda.</p>';
    return rows.map(o => {
      const hist = [...(o.sales_order_history ?? [])].sort((a, b) => a.id - b.id);
      const lines = [...(o.sales_order_lines ?? [])].sort((a, b) => a.line_no - b.line_no);
      return `<details class="card row">
        <summary><strong class="mono">${esc(o.external_id)}</strong> ${pill(o.status)} ${pill(o.payment_status, 'Pago: ' + label(o.payment_status).toLowerCase())}
          <span class="muted">${esc(o.customers?.email)} · ${esc(money(o.total_amount))} · v${esc(o.sync_version)} · ${esc(fmtDate(o.updated_at))}</span></summary>
        <div class="grid-2">
          <div><h3>Líneas</h3>${table(['#', 'SKU', 'Descripción', 'Uds.', 'Importe'], lines.map(l =>
            `<tr><td>${l.line_no}</td><td class="mono">${esc(l.sku)}</td><td>${esc(l.description)}</td><td>${l.quantity}</td><td>${esc(money(l.amount))}</td></tr>`), 'Sin líneas.')}
            <p class="muted small">${esc(o.payment_method ?? 'Sin pago')} · ${esc(o.shipping_method ?? '')}${o.delivery_point ? ' · ' + esc(o.delivery_point) : ''} · pedido el ${esc(fmtDate(o.ordered_at))}</p></div>
          <div><h3>Historial en el ERP</h3><ol class="timeline">${hist.map(h =>
            `<li><span class="muted small">${esc(fmtDate(h.created_at))} · ${esc(h.event_type ?? '')}</span><br>${h.from_status ? esc(label(h.from_status)) + ' → ' : 'Alta: '}<strong>${esc(label(h.to_status))}</strong></li>`).join('')}</ol></div>
        </div></details>`;
    }).join('');
  },

  async inventario() {
    const rows = await q(db.from('inventory').select('*').order('sku').limit(500));
    return table(['SKU', 'Descripción', 'Stock', 'Origen del último dato', 'Actualizado'], rows.map(r =>
      `<tr><td class="mono">${esc(r.sku)}</td><td>${esc(r.description)}</td><td class="${r.on_hand < 5 ? 'low' : ''}">${esc(r.on_hand)}</td><td>${pill(r.source === 'evento' ? 'ok' : 'info', label(r.source))}</td><td>${esc(fmtDate(r.updated_at))}</td></tr>`),
      'El inventario está vacío: ejecuta en n8n la carga inicial del inventario.');
  },

  async clientes() {
    const rows = await q(db.from('customers').select('email, full_name, phone, telegram_chat_id, first_order_at, created_at, sales_orders(count), tickets(count)').order('created_at', { ascending: false }).limit(200));
    return table(['Email', 'Nombre', 'Teléfono', 'Pedidos', 'Incidencias', 'Telegram', 'Alta en el CRM'], rows.map(c =>
      `<tr><td>${esc(c.email)}</td><td>${esc(c.full_name ?? '—')}</td><td>${esc(c.phone ?? '—')}</td><td>${esc(c.sales_orders?.[0]?.count ?? 0)}</td><td>${esc(c.tickets?.[0]?.count ?? 0)}</td><td>${c.telegram_chat_id ? pill('ok', 'Vinculado') : '—'}</td><td>${esc(fmtDate(c.created_at))}</td></tr>`),
      'Aún no hay clientes.');
  },

  async incidencias() {
    const rows = await q(db.from('tickets')
      .select('external_id, category, priority, status, channel, subject, description, sla_due_at, created_at, updated_at, telegram_chat_id, customers(email), sales_orders(external_id), ticket_activity(id, kind, body, author, created_at)')
      .order('updated_at', { ascending: false }).limit(100));
    if (!rows.length) return '<p class="empty">No hay incidencias en el CRM.</p>';
    const KIND = { alta: 'Alta', nota_interna: 'Nota interna', mensaje_cliente: 'Mensaje del cliente', respuesta_enviada: 'Respuesta enviada', cambio_estado: 'Cambio de estado', propuesta_ia: 'Propuesta de la IA', revision_humana: 'Revisión humana' };
    return rows.map(t => `<details class="card row">
      <summary><strong class="mono">${esc(t.external_id)}</strong> ${pill(t.status)} ${pill(t.priority, 'Prioridad ' + label(t.priority).toLowerCase())}
        <span class="muted">${esc(t.category)} · ${esc(t.customers?.email)}${t.sales_orders ? ' · ' + esc(t.sales_orders.external_id) : ''} · canal ${esc(t.channel)}</span></summary>
      <p class="quote">${esc(t.description)}</p>
      <p class="muted small">SLA: ${esc(fmtDate(t.sla_due_at))} · Telegram: ${t.telegram_chat_id ? 'vinculado' : 'no vinculado'}</p>
      <ol class="timeline">${[...(t.ticket_activity ?? [])].sort((a, b) => a.id - b.id).map(a =>
        `<li class="k-${esc(a.kind)}"><span class="muted small">${esc(fmtDate(a.created_at))} · ${esc(a.author)} · ${esc(KIND[a.kind] ?? a.kind)}</span><br>${esc(a.body)}</li>`).join('')}</ol>
    </details>`).join('');
  },

  async agente() {
    const rows = await q(db.from('agent_decisions').select('*').order('id', { ascending: false }).limit(60));
    if (!rows.length) return '<p class="empty">El agente todavía no ha hecho ninguna propuesta.</p>';
    return rows.map(d => `<article class="card">
      <header class="row-head"><strong>Propuesta #${esc(d.id)}</strong> ${pill(d.final_status)} ${d.priority ? pill(d.priority, 'Prioridad ' + label(d.priority).toLowerCase()) : ''}
        <span class="muted">${esc(d.ticket_ref)}${d.order_ref ? ' · ' + esc(d.order_ref) : ''} · ${esc(d.case_type)} · confianza ${esc(Math.round(num(d.confidence) * 100))} %</span></header>
      <dl class="dl">
        <dt>Acción propuesta</dt><dd>${esc(d.proposed_action)} <span class="muted">(${esc(d.action_type)})</span></dd>
        <dt>Justificación</dt><dd>${esc(d.justification)}</dd>
        <dt>Herramientas</dt><dd class="mono small">${esc((d.tools_used ?? []).join(', ') || '—')}</dd>
        <dt>Datos consultados</dt><dd class="mono small">${esc(JSON.stringify(d.consulted))}</dd>
        <dt>Riesgos</dt><dd>${(d.risks ?? []).length ? `<ul>${d.risks.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : '—'}</dd>
        <dt>Mensaje al cliente</dt><dd>${d.customer_message ? `<p class="quote">${esc(d.customer_message)}</p>` : '<span class="muted">Ninguno (se escala a una persona)</span>'}</dd>
        <dt>Revisión humana</dt><dd>${d.reviewed_at ? `${esc(d.reviewer)} · ${esc(fmtDate(d.reviewed_at))}${d.review_note ? ' · ' + esc(d.review_note) : ''}` : '<span class="muted">Pendiente</span>'}</dd>
      </dl>
      <p class="muted small">Modelo ${esc(d.model)} · ejecución n8n ${esc(d.execution_id)} · ${esc(fmtDate(d.created_at))}</p>
    </article>`).join('');
  },

  async registro() {
    const rows = await q(db.from('integration_log').select('*').order('id', { ascending: false }).limit(150));
    return table(['Fecha', 'Workflow · paso', 'Evento', 'Entidad', 'Resultado', 'Mensaje', 'ms'], rows.map(r =>
      `<tr><td class="nowrap">${esc(fmtDate(r.created_at))}</td><td>${esc(r.workflow)} · ${esc(r.step)}<br><span class="muted small">ejec. ${esc(r.execution_id ?? '—')}</span></td>
        <td class="mono small">${esc(r.event_type ?? '—')}</td><td class="mono small">${esc(r.entity_ref ?? '—')}</td>
        <td>${pill(r.status)}${r.error_type ? ' ' + pill('error', label(r.error_type)) : ''}</td><td>${esc(r.message ?? '')}</td><td>${esc(r.duration_ms ?? '')}</td></tr>`),
      'Todavía no se ha registrado ninguna ejecución.');
  },
};

start();
