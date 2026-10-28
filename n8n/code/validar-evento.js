// Nodo Code de n8n «Validar y normalizar» (workflow «Entrelibros · Eventos → ERP»).
// Entrada: el cuerpo del webhook (contrato entrelibros.event.v1, ver docs/tarea2/contrato.md).
// Salida: un único item con
//   valid       true / false
//   errors      [{field, type, message}]   type ∈ contrato | formato | coherencia
//   route       order | stock | ticket | ignorar
//   event       {event_id, event_type, occurred_at, source}
//   normalized  datos ya normalizados para el ERP (solo si valid)
// Este fichero es la copia legible del código que hay dentro del workflow exportado.

const body = $input.first().json.body ?? $input.first().json;
const errors = [];
const fail = (field, type, message) => errors.push({ field, type, message });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ORDER = /^EL-\d{8}-[A-Z0-9]{4}$/;
const TICKET = /^SOP-\d{8}-[A-Z0-9]{4}$/;
const ORDER_STATUS = ['creado', 'pago_simulado', 'pendiente_preparacion', 'enviado', 'entregado', 'cancelado', 'incidencia'];
const ROUTES = {
  'order.created': 'order', 'payment.simulated': 'order', 'order.status_changed': 'order',
  'stock.adjusted': 'stock', 'support.requested': 'ticket', 'support.status_changed': 'ticket',
};
const money = v => Math.round(Number(v) * 100) / 100;
const isNum = v => v !== null && v !== '' && Number.isFinite(Number(v));
const isDate = v => typeof v === 'string' && !Number.isNaN(Date.parse(v));

// ---------- 1. Sobre (envelope) ----------
if (body?.contract !== 'entrelibros.event.v1') fail('contract', 'contrato', 'Contrato desconocido o ausente');
if (!UUID.test(body?.event_id ?? '')) fail('event_id', 'contrato', 'event_id debe ser un UUID');
if (!ROUTES[body?.event_type]) fail('event_type', 'contrato', `Tipo de evento no admitido: ${body?.event_type}`);
if (!isDate(body?.occurred_at)) fail('occurred_at', 'formato', 'occurred_at no es una fecha ISO 8601');
if (!body?.data || typeof body.data !== 'object') fail('data', 'contrato', 'Falta el objeto data');

const route = ROUTES[body?.event_type] ?? 'ignorar';
const d = body?.data ?? {};
let normalized = null;

// ---------- 2. Pedido (escenarios 1 y 2) ----------
function normalizeOrder(o) {
  if (!o) { fail('data.order', 'contrato', 'Falta el pedido'); return null; }
  if (!ORDER.test(o.order_number ?? '')) fail('order.order_number', 'formato', 'Número de pedido con formato incorrecto');
  if (!ORDER_STATUS.includes(o.status)) fail('order.status', 'contrato', `Estado desconocido: ${o.status}`);
  if (!isDate(o.created_at)) fail('order.created_at', 'formato', 'Fecha del pedido no válida');
  const email = String(o.customer?.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) fail('order.customer.email', 'contrato', 'Email del cliente ausente o no válido');
  if (!Array.isArray(o.lines) || o.lines.length === 0) fail('order.lines', 'contrato', 'El pedido no tiene líneas');
  for (const k of ['subtotal', 'shipping', 'tax', 'total']) {
    if (!isNum(o.amounts?.[k])) fail(`order.amounts.${k}`, 'formato', `Importe ${k} ausente o no numérico`);
  }
  const lines = (o.lines ?? []).map((l, i) => {
    if (!l.sku) fail(`order.lines[${i}].sku`, 'contrato', 'Línea sin SKU');
    if (!Number.isInteger(Number(l.quantity)) || Number(l.quantity) <= 0) fail(`order.lines[${i}].quantity`, 'formato', 'Cantidad no válida');
    if (isNum(l.unit_price) && isNum(l.line_total) && Math.abs(money(l.unit_price * l.quantity) - money(l.line_total)) > 0.01) {
      fail(`order.lines[${i}].line_total`, 'coherencia', 'precio × cantidad no coincide con el importe de la línea');
    }
    return {
      sku: String(l.sku ?? '').toUpperCase(),
      description: [l.product_name, l.variant_name].filter(Boolean).join(' · '),
      quantity: Number(l.quantity), unit_price: money(l.unit_price), line_total: money(l.line_total),
    };
  });
  const a = o.amounts ?? {};
  if (lines.length && isNum(a.subtotal)) {
    const sum = money(lines.reduce((s, l) => s + l.line_total, 0));
    if (Math.abs(sum - money(a.subtotal)) > 0.01) fail('order.amounts.subtotal', 'coherencia', `Suma de líneas ${sum} ≠ subtotal ${a.subtotal}`);
  }
  if ([a.subtotal, a.discount ?? 0, a.shipping, a.total].every(isNum)) {
    const expected = money(Number(a.subtotal) - Number(a.discount ?? 0) + Number(a.shipping));
    if (Math.abs(expected - money(a.total)) > 0.01) fail('order.amounts.total', 'coherencia', `subtotal − descuento + envío = ${expected} ≠ total ${a.total}`);
  }
  const ship = o.shipping ?? {};
  const pay = o.payment ?? null;
  return {
    order_number: o.order_number, status: o.status, created_at: new Date(o.created_at).toISOString(),
    currency: (o.currency ?? 'EUR').toUpperCase(),
    amounts: { subtotal: money(a.subtotal), discount: money(a.discount ?? 0), shipping: money(a.shipping),
               tax: money(a.tax), total: money(a.total) },
    customer: {
      email, shop_id: o.customer?.shop_id ?? null,
      full_name: String(o.customer?.full_name ?? '').trim().replace(/\s+/g, ' '),
      // teléfono normalizado a +34XXXXXXXXX cuando es un móvil o fijo español de 9 cifras
      phone: (() => { const p = String(o.customer?.phone ?? '').replace(/[^\d+]/g, '');
                      return /^[6789]\d{8}$/.test(p) ? '+34' + p : (p || null); })(),
    },
    shipping: {
      method: ship.method ?? ship.method_code ?? null,
      pickup_point: ship.pickup_point ?? null,
      full_address: [ship.address, [ship.postcode, ship.city].filter(Boolean).join(' '), ship.province, ship.country]
        .filter(Boolean).join(', '),
    },
    payment: pay ? {
      method: { stripe_test: 'Tarjeta (Stripe test)', tarjeta_simulada: 'Tarjeta simulada', bizum_simulado: 'Bizum simulado' }[pay.method] ?? pay.method,
      reference: pay.reference ?? null,
      status_erp: pay.status === 'aprobado' ? 'pagado' : pay.status === 'rechazado' ? 'rechazado' : 'pendiente',
    } : { status_erp: 'pendiente' },
    lines,
  };
}

// ---------- 3. Stock (escenario 2) ----------
function normalizeStock(s) {
  if (!s?.sku) fail('stock.sku', 'contrato', 'Falta el SKU');
  if (!Number.isInteger(Number(s?.to)) || Number(s?.to) < 0) fail('stock.to', 'formato', 'Stock final no válido');
  return { sku: String(s?.sku ?? '').toUpperCase(), on_hand: Number(s?.to), from: s?.from ?? null, description: s?.description ?? null };
}

// ---------- 4. Incidencia (escenario 3) ----------
const CATEGORY = {
  pieza_faltante: ['Logística · pieza faltante', 'alta', 24],
  pieza_danada: ['Calidad · pieza dañada', 'alta', 24],
  retraso_envio: ['Logística · retraso de envío', 'media', 48],
  duda_montaje: ['Atención · duda de montaje', 'baja', 72],
  otro: ['Otros', 'media', 72],
};
function normalizeTicket(t) {
  if (!t) { fail('data.ticket', 'contrato', 'Falta la incidencia'); return null; }
  if (!TICKET.test(t.ticket_number ?? '')) fail('ticket.ticket_number', 'formato', 'Número de incidencia con formato incorrecto');
  const email = String(t.customer_email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) fail('ticket.customer_email', 'contrato', 'Email del cliente ausente o no válido');
  if (!CATEGORY[t.reason]) fail('ticket.reason', 'contrato', `Motivo desconocido: ${t.reason}`);
  if (t.order_number && !ORDER.test(t.order_number)) fail('ticket.order_number', 'formato', 'Número de pedido con formato incorrecto');
  const [category, priority, slaHours] = CATEGORY[t.reason] ?? CATEGORY.otro;
  const created = isDate(t.created_at) ? new Date(t.created_at) : new Date();
  return {
    ticket_number: t.ticket_number, customer_email: email, customer_name: t.customer_name ?? null,
    order_number: t.order_number ?? null, reason: t.reason, category, priority, status: t.status,
    subject: `${category}${t.order_number ? ' · ' + t.order_number : ''}`,
    message: String(t.message ?? '').trim().slice(0, 2000),
    sla_due_at: new Date(created.getTime() + slaHours * 3600e3).toISOString(),
    // token que la tienda enseña al cliente para vincular Telegram; el CRM lo guarda con el ticket
    telegram_token: /^[a-f0-9]{8,40}$/i.test(t.telegram_token ?? '') ? t.telegram_token : null,
  };
}

if (route === 'order') normalized = normalizeOrder(d.order);
else if (route === 'stock') normalized = normalizeStock(d.stock);
else if (route === 'ticket') normalized = normalizeTicket(d.ticket);

return [{
  json: {
    valid: errors.length === 0,
    errors,
    error_type: errors[0]?.type ?? null,
    route,
    event: { event_id: body?.event_id ?? null, event_type: body?.event_type ?? null,
             occurred_at: body?.occurred_at ?? null, source: body?.source ?? null },
    entity_ref: d.ticket?.ticket_number ?? d.order?.order_number ?? d.stock?.sku ?? null,
    normalized,
    started_at: Date.now(),
  },
}];
