// Correo de confirmación del pedido después de pagar con Stripe.
//
// Lo envía el servidor (nunca el navegador) con la API de correo transaccional de Brevo, la misma
// cuenta que usa Supabase Auth para los correos de las cuentas. Se llama una sola vez por pedido:
// confirmPaidSession (stripe.ts) solo lo hace cuando confirm_stripe_payment acaba de registrar el
// pago (already_confirmed = false). Si la vuelta del cliente y el webhook llegan a la vez, solo uno
// de los dos lo registra y solo ese manda el correo.
//
// Secrets de Supabase (Edge Functions → Secrets):
//   BREVO_API_KEY   clave de API de Brevo (xkeysib-…). No es la clave SMTP.
//   MAIL_FROM       remitente verificado en Brevo (el mismo que el de los correos de Supabase Auth)
//   MAIL_FROM_NAME  opcional; por defecto "Entrelibros"
// Si falta BREVO_API_KEY o MAIL_FROM no se envía nada y queda un aviso en los logs: el pago no falla.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

type Lang = 'es' | 'en';

interface OrderRow {
  order_number: string;
  status: string;
  created_at: string;
  subtotal: number;
  discount_code: string | null;
  discount_amount: number;
  shipping_cost: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  ship_name: string;
  ship_address: string;
  ship_city: string;
  ship_postcode: string;
  ship_province: string;
  customer_notes: string | null;
  customer: { email: string; full_name: string } | null;
  shipping: { code: string; name: string; eta_days_min: number; eta_days_max: number } | null;
  items: {
    product_name: string;
    variant_name: string;
    sku: string;
    unit_price: number;
    quantity: number;
    line_total: number;
    variant: { name_en: string | null; product: { name_en: string | null } | null } | null;
  }[];
  payments: { method: string; status: string; card_last4: string | null; transaction_ref: string }[];
}

// ---------- Textos ----------

const T = {
  es: {
    subject: (n: string) => `Pedido ${n} confirmado · Entrelibros`,
    subjectIssue: (n: string) => `Pago recibido del pedido ${n} · Entrelibros`,
    hello: (name: string) => `Hola, ${name}:`,
    intro: 'Hemos recibido el pago de tu pedido. Estos son los datos:',
    issue: 'Hemos recibido el pago, pero mientras pagabas se ha agotado alguno de los productos. Revisaremos el pedido y te escribiremos para enviártelo en cuanto lo tengamos o devolverte el importe.',
    order: 'Pedido', date: 'Fecha',
    product: 'Producto', qty: 'Uds.', price: 'Precio', amount: 'Importe',
    subtotal: 'Subtotal', discount: (c: string) => `Descuento (${c})`, shipping: 'Envío', free: 'Gratis',
    total: 'Total', vat: (r: string) => `IVA incluido (${r} %)`,
    shipTo: 'Envío a', method: 'Método', eta: 'Entrega estimada',
    etaRange: (a: string, b: string) => `entre el ${a} y el ${b}`,
    notes: 'Notas', payment: 'Pago', card: 'Tarjeta (Stripe, prueba)', ref: 'Referencia',
    button: 'Ver mi pedido',
    help: 'Si tienes cualquier problema, responde a este correo o escríbenos desde Soporte indicando tu número de pedido.',
    fake: 'Entrelibros es una tienda ficticia, proyecto de la asignatura Soluciones Informáticas para la Empresa (UCAM). El pago se ha hecho con Stripe en modo prueba: no se ha cobrado nada.',
    shipping_methods: {} as Record<string, string>,
    locale: 'es-ES',
  },
  en: {
    subject: (n: string) => `Order ${n} confirmed · Entrelibros`,
    subjectIssue: (n: string) => `Payment received for order ${n} · Entrelibros`,
    hello: (name: string) => `Hi ${name},`,
    intro: 'We have received the payment for your order. Here are the details:',
    issue: 'We have received the payment, but one of the products sold out while you were paying. We will review the order and get back to you to ship it as soon as it is back in stock or refund you.',
    order: 'Order', date: 'Date',
    product: 'Product', qty: 'Qty', price: 'Price', amount: 'Amount',
    subtotal: 'Subtotal', discount: (c: string) => `Discount (${c})`, shipping: 'Shipping', free: 'Free',
    total: 'Total', vat: (r: string) => `VAT included (${r}%)`,
    shipTo: 'Ship to', method: 'Method', eta: 'Estimated delivery',
    etaRange: (a: string, b: string) => `between ${a} and ${b}`,
    notes: 'Notes', payment: 'Payment', card: 'Card (Stripe, test)', ref: 'Reference',
    button: 'View my order',
    help: 'If anything is wrong, reply to this email or contact us from Support with your order number.',
    fake: 'Entrelibros is a fictitious shop, a project for the Business IT Solutions course (UCAM). The payment was made with Stripe in test mode: nothing has been charged.',
    shipping_methods: {
      estandar: 'Standard home delivery',
      express: 'Express delivery 24/48 h',
      punto: 'Pickup point',
    } as Record<string, string>,
    locale: 'en-GB',
  },
};

// ---------- Utilidades ----------

const esc = (s: unknown) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function money(n: number, lang: Lang) {
  return new Intl.NumberFormat(T[lang].locale, { style: 'currency', currency: 'EUR' }).format(Number(n));
}

/** Suma días laborables (sin sábados ni domingos), igual que la página de confirmación. */
function addBusinessDays(date: string, days: number) {
  const d = new Date(date);
  while (days > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days--;
  }
  return d;
}

const longDate = (d: Date, lang: Lang) =>
  d.toLocaleDateString(T[lang].locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
const shortDateTime = (s: string, lang: Lang) =>
  new Date(s).toLocaleString(T[lang].locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' });

// ---------- Contenido del correo ----------

/** Asunto, HTML y texto plano del correo. No toca la red: se puede probar suelta. */
export function buildOrderEmail(o: OrderRow, lang: Lang, orderUrl: string) {
  const t = T[lang];
  const issue = o.status === 'incidencia';
  const name = (o.customer?.full_name ?? o.ship_name).split(' ')[0];
  const payment = o.payments.find(p => p.status === 'aprobado') ?? o.payments[0];
  const ship = o.shipping;
  const shipName = ship ? (lang === 'en' ? t.shipping_methods[ship.code] ?? ship.name : ship.name) : '';
  const eta = ship && !issue
    ? t.etaRange(longDate(addBusinessDays(o.created_at, ship.eta_days_min), lang),
                 longDate(addBusinessDays(o.created_at, ship.eta_days_max), lang))
    : '';
  const items = o.items.map(i => ({
    name: lang === 'en' ? i.variant?.product?.name_en || i.product_name : i.product_name,
    variant: lang === 'en' ? i.variant?.name_en || i.variant_name : i.variant_name,
    sku: i.sku, qty: i.quantity, price: money(i.unit_price, lang), total: money(i.line_total, lang),
  }));
  const rows: [string, string, boolean?][] = [
    [t.subtotal, money(o.subtotal, lang)],
    ...(Number(o.discount_amount) > 0 ? [[t.discount(o.discount_code ?? ''), `−${money(o.discount_amount, lang)}`] as [string, string]] : []),
    [t.shipping, Number(o.shipping_cost) > 0 ? money(o.shipping_cost, lang) : t.free],
    [t.total, money(o.total, lang), true],
    [t.vat(String(Number(o.tax_rate))), money(o.tax_amount, lang)],
  ];
  const address = [o.ship_name, o.ship_address, `${o.ship_postcode} ${o.ship_city} (${o.ship_province})`];
  const subject = issue ? t.subjectIssue(o.order_number) : t.subject(o.order_number);

  // HTML de correo: tablas y estilos en línea (Gmail y Outlook ignoran casi todo el CSS)
  const C = { ink: '#1D2537', muted: '#5B6577', line: '#E3E6EC', bg: '#EEF1F5', accent: '#FFB547', night: '#10182B' };
  const cell = `padding:10px 0;border-bottom:1px solid ${C.line};vertical-align:top;`;
  const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:Arial,Helvetica,sans-serif;color:${C.ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">
  <tr><td style="background:${C.night};padding:22px 28px;">
    <span style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:bold;color:#F4EBDD;">Entrelibros</span>
  </td></tr>
  <tr><td style="padding:28px;">
    <p style="margin:0 0 12px;font-size:16px;">${esc(t.hello(name))}</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">${esc(issue ? t.issue : t.intro)}</p>
    <p style="margin:0 0 20px;font-size:15px;"><strong>${esc(t.order)} ${esc(o.order_number)}</strong><br>
      <span style="color:${C.muted};font-size:13px;">${esc(t.date)}: ${esc(shortDateTime(o.created_at, lang))}</span></p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;">
      <tr style="color:${C.muted};font-size:12px;text-transform:uppercase;">
        <td style="${cell}">${esc(t.product)}</td>
        <td style="${cell}text-align:center;padding-left:12px;">${esc(t.qty)}</td>
        <td style="${cell}text-align:right;padding-left:12px;">${esc(t.amount)}</td>
      </tr>
      ${items.map(i => `<tr>
        <td style="${cell}"><strong>${esc(i.name)}</strong><br><span style="color:${C.muted};font-size:12px;">${esc(i.variant)} · ${esc(i.sku)} · ${esc(i.price)}</span></td>
        <td style="${cell}text-align:center;padding-left:12px;">${i.qty}</td>
        <td style="${cell}text-align:right;white-space:nowrap;padding-left:12px;">${esc(i.total)}</td>
      </tr>`).join('')}
      ${rows.map(([label, value, strong]) => `<tr>
        <td colspan="2" style="padding:6px 0;text-align:right;${strong ? 'font-size:16px;font-weight:bold;' : `color:${C.muted};`}">${esc(label)}</td>
        <td style="padding:6px 0 6px 12px;text-align:right;white-space:nowrap;${strong ? 'font-size:16px;font-weight:bold;' : ''}">${esc(value)}</td>
      </tr>`).join('')}
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;font-size:14px;line-height:1.5;">
      <tr><td style="padding:14px 16px;background:${C.bg};border-radius:10px;">
        <strong>${esc(t.shipTo)}</strong><br>${address.map(esc).join('<br>')}
        ${shipName ? `<br><br><strong>${esc(t.method)}:</strong> ${esc(shipName)}` : ''}
        ${eta ? `<br><strong>${esc(t.eta)}:</strong> ${esc(eta)}` : ''}
        ${o.customer_notes ? `<br><strong>${esc(t.notes)}:</strong> ${esc(o.customer_notes)}` : ''}
        ${payment ? `<br><br><strong>${esc(t.payment)}:</strong> ${esc(t.card)}${payment.card_last4 ? ` ···· ${esc(payment.card_last4)}` : ''}` : ''}
      </td></tr>
    </table>

    <p style="margin:26px 0;text-align:center;">
      <a href="${esc(orderUrl)}" style="display:inline-block;background:${C.accent};color:${C.night};text-decoration:none;font-weight:bold;padding:12px 26px;border-radius:999px;">${esc(t.button)}</a>
    </p>
    <p style="margin:0;font-size:13px;color:${C.muted};line-height:1.5;">${esc(t.help)}</p>
  </td></tr>
  <tr><td style="padding:16px 28px;background:${C.bg};font-size:11px;color:${C.muted};line-height:1.5;">${esc(t.fake)}</td></tr>
</table>
</td></tr></table>
</body></html>`;

  // Versión en texto plano (algunos lectores de correo y filtros de spam la usan)
  const text = [
    t.hello(name), '', issue ? t.issue : t.intro, '',
    `${t.order} ${o.order_number} · ${shortDateTime(o.created_at, lang)}`, '',
    ...items.map(i => `- ${i.qty} × ${i.name} (${i.variant}, ${i.sku}): ${i.total}`), '',
    ...rows.map(([l, v]) => `${l}: ${v}`), '',
    `${t.shipTo}: ${address.join(', ')}`,
    ...(shipName ? [`${t.method}: ${shipName}`] : []),
    ...(eta ? [`${t.eta}: ${eta}`] : []),
    ...(payment ? [`${t.payment}: ${t.card}${payment.card_last4 ? ` ···· ${payment.card_last4}` : ''}`] : []),
    '', `${t.button}: ${orderUrl}`, '', t.help, '', t.fake,
  ].join('\n');

  return { subject, html, text, to: { email: o.customer?.email ?? '', name: o.customer?.full_name ?? o.ship_name } };
}

// ---------- Envío ----------

/**
 * `client`: el cliente de Supabase con la clave secreta (db() de stripe.ts).
 * Lee el pedido de la BD y manda el correo de confirmación. Nunca lanza errores: el pago ya está
 * registrado y un fallo del correo no puede deshacerlo; solo queda en los logs de la función.
 */
export async function sendOrderConfirmation(client: SupabaseClient, orderNumber: string, lang: Lang, siteBase: string) {
  try {
    const apiKey = Deno.env.get('BREVO_API_KEY') ?? '';
    const from = Deno.env.get('MAIL_FROM') ?? '';
    if (!apiKey || !from) {
      console.warn('[correo] sin BREVO_API_KEY o MAIL_FROM: no se envía la confirmación de', orderNumber);
      return { sent: false };
    }

    const { data: order, error } = await client
      .from('orders')
      .select(`order_number, status, created_at, subtotal, discount_code, discount_amount, shipping_cost,
        tax_rate, tax_amount, total, ship_name, ship_address, ship_city, ship_postcode, ship_province, customer_notes,
        customer:customers ( email, full_name ),
        shipping:shipping_methods ( code, name, eta_days_min, eta_days_max ),
        items:order_items ( product_name, variant_name, sku, unit_price, quantity, line_total,
          variant:product_variants ( name_en, product:products ( name_en ) ) ),
        payments ( method, status, card_last4, transaction_ref )`)
      .eq('order_number', orderNumber)
      .maybeSingle<OrderRow>();
    if (error) throw error;
    if (!order?.customer?.email) throw new Error(`pedido ${orderNumber} sin email`);

    const orderUrl = `${siteBase}pedido.html?${new URLSearchParams({ pedido: order.order_number, email: order.customer.email })}`
      + (lang === 'en' ? '&lang=en' : '');
    const mail = buildOrderEmail(order, lang, orderUrl);

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: from, name: Deno.env.get('MAIL_FROM_NAME') || 'Entrelibros' },
        to: [mail.to],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
        tags: ['pedido-confirmado'],
      }),
    });
    if (!res.ok) throw new Error(`Brevo respondió ${res.status}: ${await res.text()}`);
    console.log('[correo] confirmación enviada:', orderNumber);
    return { sent: true };
  } catch (err) {
    console.error('[correo] no se ha podido enviar la confirmación de', orderNumber, err);
    return { sent: false };
  }
}
