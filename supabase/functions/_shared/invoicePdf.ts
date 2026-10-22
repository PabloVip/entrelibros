// Factura del pedido en PDF, generada en el servidor para adjuntarla al correo de confirmación.
// Es el mismo diseño que la que descarga el cliente en la web (public/js/services/invoiceService.js);
// si se cambia una, hay que cambiar la otra.
//
// Tienda ficticia (proyecto académico): sin NIF ni validez fiscal, y lo dice en el propio PDF.
import { jsPDF } from 'npm:jspdf@2.5.1';

export type Lang = 'es' | 'en';

/** Datos que necesita la factura (ya traducidos si la factura es en inglés). */
export interface InvoiceData {
  order_number: string;
  paid_at: string;
  customer_name: string;
  email: string;
  ship: { name: string; address: string; postcode: string; city: string; province: string; method: string };
  items: { name: string; variant: string; sku: string; quantity: number; unit_price: number; line_total: number }[];
  subtotal: number;
  discount_code: string | null;
  discount_amount: number;
  shipping_cost: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  payment: { method: string; last4: string | null; ref: string };
}

const L = {
  es: {
    title: 'FACTURA', number: 'Nº de factura', date: 'Fecha', order: 'Pedido',
    seller: 'Vendedor', sellerLines: ['Entrelibros (tienda ficticia)', 'Proyecto académico · UCAM', 'pablovip.github.io/entrelibros'],
    buyer: 'Cliente', shipTo: 'Dirección de envío',
    product: 'Producto', qty: 'Uds.', price: 'Precio', amount: 'Importe',
    subtotal: 'Subtotal', discount: (c: string) => `Descuento (${c})`, shipping: 'Envío', free: 'Gratis',
    base: 'Base imponible', vat: (r: number) => `IVA (${r} %)`, total: 'TOTAL',
    vatNote: 'Precios con IVA incluido.',
    payment: 'Pago', paid: 'Pagado el', ref: 'Referencia', shipMethod: 'Método de envío',
    legal: 'Documento sin validez fiscal. Entrelibros es una tienda ficticia, proyecto de la asignatura Soluciones Informáticas para la Empresa (UCAM). No se ha cobrado ningún importe real.',
    page: (a: number, b: number) => `Página ${a} de ${b}`,
    file: (n: string) => `factura-${n}.pdf`,
    locale: 'es-ES',
  },
  en: {
    title: 'INVOICE', number: 'Invoice no.', date: 'Date', order: 'Order',
    seller: 'Seller', sellerLines: ['Entrelibros (fictitious shop)', 'Academic project · UCAM', 'pablovip.github.io/entrelibros'],
    buyer: 'Customer', shipTo: 'Shipping address',
    product: 'Product', qty: 'Qty', price: 'Price', amount: 'Amount',
    subtotal: 'Subtotal', discount: (c: string) => `Discount (${c})`, shipping: 'Shipping', free: 'Free',
    base: 'Taxable amount', vat: (r: number) => `VAT (${r}%)`, total: 'TOTAL',
    vatNote: 'Prices include VAT.',
    payment: 'Payment', paid: 'Paid on', ref: 'Reference', shipMethod: 'Shipping method',
    legal: 'Not a valid tax document. Entrelibros is a fictitious shop, a project for the Business IT Solutions course (UCAM). No real money has been charged.',
    page: (a: number, b: number) => `Page ${a} of ${b}`,
    file: (n: string) => `invoice-${n}.pdf`,
    locale: 'en-GB',
  },
};

/** EL-20261021-3Z5T → F-20261021-3Z5T */
export const invoiceNumber = (orderNumber: string) => orderNumber.replace(/^EL-/, 'F-');
export const invoiceFileName = (orderNumber: string, lang: Lang) => L[lang].file(orderNumber);

/** Las fuentes estándar de los PDF solo tienen los caracteres latinos básicos. */
const pdfText = (s: unknown) => String(s ?? '')
  .replace(/[−‒–—]/g, '-')
  .replace(/[   ]/g, ' ')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/…/g, '...')
  .replace(/[^\x20-\x7E¡-ÿ€]/g, '');

type RGB = [number, number, number];

/** Devuelve el PDF de la factura (bytes). */
export function buildInvoicePdf(o: InvoiceData, lang: Lang): Uint8Array {
  const l = L[lang];
  const euro = new Intl.NumberFormat(l.locale, { style: 'currency', currency: 'EUR' });
  const money = (n: number) => pdfText(euro.format(Number(n ?? 0)));
  const day = (v: string) => new Intl.DateTimeFormat(l.locale, { dateStyle: 'long', timeZone: 'Europe/Madrid' }).format(new Date(v));

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 18, R = W - M;
  const INK: RGB = [16, 24, 43], MUTED: RGB = [91, 101, 119], LINE: RGB = [215, 221, 230];
  let y = 0;

  const text = (s: unknown, x: number, yy: number, opts: Record<string, unknown> = {}) => doc.text(pdfText(s), x, yy, opts);
  const font = (size: number, style = 'normal', color: RGB = INK) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color); };
  const rule = (yy: number, color: RGB = LINE) => { doc.setDrawColor(...color); doc.setLineWidth(0.3); doc.line(M, yy, R, yy); };

  // Cabecera
  doc.setFillColor(...INK);
  doc.rect(0, 0, W, 30, 'F');
  font(22, 'bold', [244, 235, 221]); text('Entrelibros', M, 19);
  font(18, 'bold', [255, 181, 71]); text(l.title, R, 19, { align: 'right' });

  // Datos de la factura y vendedor
  y = 42;
  [[l.number, invoiceNumber(o.order_number)], [l.date, day(o.paid_at)], [l.order, o.order_number]].forEach(([k, v], i) => {
    font(9, 'normal', MUTED); text(k, R - 62, y + i * 6);
    font(10, 'bold'); text(v, R, y + i * 6, { align: 'right' });
  });
  font(9, 'bold', MUTED); text(l.seller.toUpperCase(), M, y);
  font(10, 'normal'); l.sellerLines.forEach((s, i) => text(s, M, y + 6 + i * 5));

  // Cliente y envío
  y = 72;
  rule(y - 6);
  const s = o.ship;
  font(9, 'bold', MUTED); text(l.buyer.toUpperCase(), M, y); text(l.shipTo.toUpperCase(), W / 2 + 4, y);
  font(10, 'normal');
  [o.customer_name, o.email].filter(Boolean).forEach((v, i) => text(v, M, y + 6 + i * 5));
  [s.name, s.address, `${s.postcode} ${s.city} (${s.province})`].forEach((v, i) => {
    doc.text(doc.splitTextToSize(pdfText(v), R - (W / 2 + 4)), W / 2 + 4, y + 6 + i * 5);
  });

  // Líneas
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
  for (const i of o.items) {
    const name: string[] = doc.splitTextToSize(pdfText(i.name), col.qty - 16 - M);
    const h = name.length * 5 + 6;
    if (y + h > 250) { doc.addPage(); y = 24; header(); }
    font(10, 'bold'); doc.text(name, M + 2, y);
    font(10, 'normal');
    text(String(i.quantity), col.qty, y, { align: 'right' });
    text(money(i.unit_price), col.price, y, { align: 'right' });
    text(money(i.line_total), col.amount - 2, y, { align: 'right' });
    font(8.5, 'normal', MUTED); text(`${i.variant} · ${i.sku}`, M + 2, y + name.length * 5 - 0.5);
    y += h;
    rule(y - 4);
  }

  // Totales
  if (y > 215) { doc.addPage(); y = 24; }
  y += 4;
  const total = Number(o.total), tax = Number(o.tax_amount);
  const rows: [string, string][] = [
    [l.subtotal, money(o.subtotal)],
    ...(Number(o.discount_amount) > 0 ? [[l.discount(o.discount_code ?? ''), `-${money(o.discount_amount)}`] as [string, string]] : []),
    [l.shipping, Number(o.shipping_cost) > 0 ? money(o.shipping_cost) : l.free],
    [l.base, money(total - tax)],
    [l.vat(Number(o.tax_rate)), money(tax)],
  ];
  for (const [k, v] of rows) {
    font(10, 'normal', MUTED); text(k, col.price - 30, y);
    font(10, 'normal'); text(v, col.amount - 2, y, { align: 'right' });
    y += 6;
  }
  doc.setFillColor(...INK);
  doc.rect(col.price - 34, y - 4.5, R - (col.price - 34), 10, 'F');
  font(12, 'bold', [255, 255, 255]);
  text(l.total, col.price - 30, y + 2); text(money(total), col.amount - 2, y + 2, { align: 'right' });
  y += 12;
  font(8.5, 'normal', MUTED); text(l.vatNote, col.amount - 2, y, { align: 'right' });

  // Pago y envío
  y += 10;
  const p = o.payment;
  font(9, 'bold', MUTED); text(l.payment.toUpperCase(), M, y);
  font(10, 'normal');
  text(p.method + (p.last4 ? ` **** ${p.last4}` : ''), M, y + 6);
  text(`${l.paid} ${day(o.paid_at)}`, M, y + 11);
  font(8.5, 'normal', MUTED);
  doc.text(doc.splitTextToSize(pdfText(`${l.ref}: ${p.ref}`), W / 2 - M - 4), M, y + 16);
  font(9, 'bold', MUTED); text(l.shipMethod.toUpperCase(), W / 2 + 4, y);
  font(10, 'normal'); doc.text(doc.splitTextToSize(pdfText(s.method), R - (W / 2 + 4)), W / 2 + 4, y + 6);

  // Pie en todas las páginas
  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n);
    rule(277, LINE);
    font(8, 'normal', MUTED);
    doc.text(doc.splitTextToSize(pdfText(l.legal), R - M - 30), M, 282);
    text(l.page(n, pages), R, 282, { align: 'right' });
  }
  doc.setProperties({ title: `${l.title} ${invoiceNumber(o.order_number)}`, author: 'Entrelibros', creator: 'Entrelibros' });
  return new Uint8Array(doc.output('arraybuffer'));
}
