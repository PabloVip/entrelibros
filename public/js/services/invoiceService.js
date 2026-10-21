// Factura del pedido en PDF, generada en el navegador con jsPDF a partir de los datos que ya
// enseña pedido.html (get_order_summary). No guarda nada en el servidor: se descarga al momento.
//
// Es un documento de una tienda ficticia (proyecto académico): no tiene NIF ni validez fiscal y lo
// dice en el propio PDF. La librería solo se descarga la primera vez que se pulsa el botón.
import { lang, t } from '../core/i18n.js';
import { METHOD_LABELS } from './orderService.js';

const JSPDF_URL = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
const JSPDF_SRI = 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk';

/** Pedidos con el pago registrado: solo de esos hay factura. */
export const INVOICE_STATUSES = ['pago_simulado', 'pendiente_preparacion', 'enviado', 'entregado', 'incidencia'];
export const hasInvoice = order => INVOICE_STATUSES.includes(order?.status) && order?.payment?.status === 'aprobado';

// El PDF no pasa por el traductor de la página: sus textos van aquí en los dos idiomas
const L = {
  es: {
    title: 'FACTURA', number: 'Nº de factura', date: 'Fecha', order: 'Pedido',
    seller: 'Vendedor', sellerLines: ['Entrelibros (tienda ficticia)', 'Proyecto académico · UCAM', 'pablovip.github.io/entrelibros'],
    buyer: 'Cliente', shipTo: 'Dirección de envío',
    product: 'Producto', qty: 'Uds.', price: 'Precio', amount: 'Importe',
    subtotal: 'Subtotal', discount: c => `Descuento (${c})`, shipping: 'Envío', free: 'Gratis',
    base: 'Base imponible', vat: r => `IVA (${r} %)`, total: 'TOTAL',
    vatNote: 'Precios con IVA incluido.',
    payment: 'Pago', paid: 'Pagado el', ref: 'Referencia', shipMethod: 'Método de envío',
    legal: 'Documento sin validez fiscal. Entrelibros es una tienda ficticia, proyecto de la asignatura Soluciones Informáticas para la Empresa (UCAM). No se ha cobrado ningún importe real.',
    page: (a, b) => `Página ${a} de ${b}`,
    file: n => `factura-${n}.pdf`,
    locale: 'es-ES',
  },
  en: {
    title: 'INVOICE', number: 'Invoice no.', date: 'Date', order: 'Order',
    seller: 'Seller', sellerLines: ['Entrelibros (fictitious shop)', 'Academic project · UCAM', 'pablovip.github.io/entrelibros'],
    buyer: 'Customer', shipTo: 'Shipping address',
    product: 'Product', qty: 'Qty', price: 'Price', amount: 'Amount',
    subtotal: 'Subtotal', discount: c => `Discount (${c})`, shipping: 'Shipping', free: 'Free',
    base: 'Taxable amount', vat: r => `VAT (${r}%)`, total: 'TOTAL',
    vatNote: 'Prices include VAT.',
    payment: 'Payment', paid: 'Paid on', ref: 'Reference', shipMethod: 'Shipping method',
    legal: 'Not a valid tax document. Entrelibros is a fictitious shop, a project for the Business IT Solutions course (UCAM). No real money has been charged.',
    page: (a, b) => `Page ${a} of ${b}`,
    file: n => `invoice-${n}.pdf`,
    locale: 'en-GB',
  },
};

let loading = null;
/** Carga jsPDF una sola vez (script UMD con integridad comprobada). */
function loadJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSPDF_URL;
    s.integrity = JSPDF_SRI;
    s.crossOrigin = 'anonymous';
    s.onload = () => (window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('jsPDF no disponible')));
    s.onerror = () => { loading = null; s.remove(); reject(new Error('No se ha podido cargar el generador de PDF')); };
    document.head.append(s);
  });
  return loading;
}

/** Número de factura a partir del pedido: EL-20261021-3Z5T → F-20261021-3Z5T. */
export const invoiceNumber = orderNumber => orderNumber.replace(/^EL-/, 'F-');

/**
 * Las fuentes estándar de los PDF (Helvetica) solo tienen los caracteres latinos básicos.
 * Se cambian los que faltan por su equivalente y se quitan los que no tienen.
 */
const pdfText = s => String(s ?? '')
  .replace(/[−‒–—]/g, '-')
  .replace(/[   ]/g, ' ')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/…/g, '...')
  .replace(/[^\x20-\x7E¡-ÿ€]/g, '');

/** Genera la factura y la descarga. `order` es el resumen de get_order_summary. */
export async function downloadInvoice(order, email) {
  if (!hasInvoice(order)) throw new Error('Este pedido todavía no tiene factura');
  const JsPDF = await loadJsPdf();
  const l = L[lang === 'en' ? 'en' : 'es'];
  const euro = new Intl.NumberFormat(l.locale, { style: 'currency', currency: 'EUR' });
  const money = n => pdfText(euro.format(Number(n ?? 0)));
  const day = v => new Intl.DateTimeFormat(l.locale, { dateStyle: 'long' }).format(new Date(v));
  const tr = s => pdfText(t(s)); // nombres de productos y envíos en inglés si la página está en inglés

  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 18, R = W - M;          // ancho, margen, borde derecho
  const INK = [16, 24, 43], MUTED = [91, 101, 119], LINE = [215, 221, 230];
  let y = 0;

  const text = (s, x, yy, opts = {}) => doc.text(pdfText(s), x, yy, opts);
  const font = (size, style = 'normal', color = INK) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color); };
  const rule = (yy, color = LINE) => { doc.setDrawColor(...color); doc.setLineWidth(0.3); doc.line(M, yy, R, yy); };

  // ---------- Cabecera ----------
  doc.setFillColor(...INK);
  doc.rect(0, 0, W, 30, 'F');
  font(22, 'bold', [244, 235, 221]);
  text('Entrelibros', M, 19);
  font(18, 'bold', [255, 181, 71]);
  text(l.title, R, 19, { align: 'right' });

  // ---------- Datos de la factura ----------
  y = 42;
  const paidAt = order.payment?.created_at ?? order.created_at;
  const meta = [[l.number, invoiceNumber(order.order_number)], [l.date, day(paidAt)], [l.order, order.order_number]];
  meta.forEach(([k, v], i) => {
    font(9, 'normal', MUTED); text(k, R - 62, y + i * 6);
    font(10, 'bold'); text(v, R, y + i * 6, { align: 'right' });
  });

  // vendedor (izquierda)
  font(9, 'bold', MUTED); text(l.seller.toUpperCase(), M, y);
  font(10, 'normal');
  l.sellerLines.forEach((s, i) => text(s, M, y + 6 + i * 5));

  // ---------- Cliente y envío ----------
  y = 72;
  rule(y - 6);
  const s = order.shipping;
  const buyer = [order.customer_name ?? s.name, email].filter(Boolean);
  const address = [s.name, s.address, `${s.postcode} ${s.city} (${s.province})`];
  font(9, 'bold', MUTED); text(l.buyer.toUpperCase(), M, y); text(l.shipTo.toUpperCase(), W / 2 + 4, y);
  font(10, 'normal');
  buyer.forEach((v, i) => text(v, M, y + 6 + i * 5));
  address.forEach((v, i) => {
    const lines = doc.splitTextToSize(pdfText(v), R - (W / 2 + 4));
    doc.text(lines, W / 2 + 4, y + 6 + i * 5);
  });

  // ---------- Líneas ----------
  y = 104;
  const col = { qty: 128, price: 156, amount: R };
  const header = () => {
    doc.setFillColor(238, 241, 245);
    doc.rect(M, y - 5, R - M, 8, 'F');
    font(9, 'bold', MUTED);
    text(l.product, M + 2, y); text(l.qty, col.qty, y, { align: 'right' });
    text(l.price, col.price, y, { align: 'right' }); text(l.amount, col.amount - 2, y, { align: 'right' });
    y += 9;
  };
  header();
  for (const i of order.items) {
    const name = doc.splitTextToSize(tr(i.product_name), col.qty - 16 - M);
    const sub = pdfText(`${t(i.variant_name)} · ${i.sku}`);
    const h = name.length * 5 + 6;
    if (y + h > 250) { doc.addPage(); y = 24; header(); } // salto de página con la cabecera de la tabla
    font(10, 'bold'); doc.text(name, M + 2, y);
    font(10, 'normal');
    text(String(i.quantity), col.qty, y, { align: 'right' });
    text(money(i.unit_price), col.price, y, { align: 'right' });
    text(money(i.line_total), col.amount - 2, y, { align: 'right' });
    font(8.5, 'normal', MUTED); text(sub, M + 2, y + name.length * 5 - 0.5);
    y += h;
    rule(y - 4);
  }

  // ---------- Totales ----------
  if (y > 215) { doc.addPage(); y = 24; }
  y += 4;
  const total = Number(order.total), tax = Number(order.tax_amount);
  const rows = [
    [l.subtotal, money(order.subtotal)],
    ...(Number(order.discount_amount) > 0 ? [[l.discount(order.discount_code ?? ''), `-${money(order.discount_amount)}`]] : []),
    [l.shipping, Number(order.shipping_cost) > 0 ? money(order.shipping_cost) : l.free],
    [l.base, money(total - tax)],
    [l.vat(Number(order.tax_rate)), money(tax)],
  ];
  rows.forEach(([k, v]) => {
    font(10, 'normal', MUTED); text(k, col.price - 30, y);
    font(10, 'normal'); text(v, col.amount - 2, y, { align: 'right' });
    y += 6;
  });
  doc.setFillColor(...INK);
  doc.rect(col.price - 34, y - 4.5, R - (col.price - 34), 10, 'F');
  font(12, 'bold', [255, 255, 255]);
  text(l.total, col.price - 30, y + 2); text(money(total), col.amount - 2, y + 2, { align: 'right' });
  y += 12;
  font(8.5, 'normal', MUTED); text(l.vatNote, col.amount - 2, y, { align: 'right' });

  // ---------- Pago y envío ----------
  y += 10;
  const p = order.payment;
  font(9, 'bold', MUTED); text(l.payment.toUpperCase(), M, y);
  font(10, 'normal');
  const method = t(METHOD_LABELS[p.method] ?? p.method) + (p.card_last4 ? ` **** ${p.card_last4}` : '');
  text(method, M, y + 6);
  text(`${l.paid} ${day(paidAt)}`, M, y + 11);
  font(8.5, 'normal', MUTED);
  doc.text(doc.splitTextToSize(pdfText(`${l.ref}: ${p.transaction_ref}`), W / 2 - M - 4), M, y + 16);
  font(9, 'bold', MUTED); text(l.shipMethod.toUpperCase(), W / 2 + 4, y);
  font(10, 'normal'); doc.text(doc.splitTextToSize(tr(s.method), R - (W / 2 + 4)), W / 2 + 4, y + 6);

  // ---------- Pie en todas las páginas ----------
  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n);
    rule(277, LINE);
    font(8, 'normal', MUTED);
    doc.text(doc.splitTextToSize(pdfText(l.legal), R - M - 30), M, 282);
    text(l.page(n, pages), R, 282, { align: 'right' });
  }
  doc.setProperties({ title: `${l.title} ${invoiceNumber(order.order_number)}`, author: 'Entrelibros', creator: 'Entrelibros' });
  doc.save(l.file(order.order_number));
}
