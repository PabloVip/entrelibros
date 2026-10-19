// Idioma de la web (español / inglés).
//
// La web está escrita en español. Cuando el usuario elige inglés, este módulo
// traduce la página en el navegador con el diccionario de js/i18n/en.js:
// textos fijos del HTML, textos que pintan los scripts (MutationObserver),
// atributos (placeholder, aria-label, alt, title), el <title> y los mensajes
// que devuelve el servidor. Los datos de la base de datos (nombres de producto,
// temáticas...) también están en el diccionario, así que Supabase no cambia.
//
// Idioma: ?lang=en|es en la URL > preferencia guardada > español.

const STORAGE_KEY = 'entrelibros_lang';
const SUPPORTED = ['es', 'en'];

function readLang() {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (SUPPORTED.includes(fromUrl)) {
    try { localStorage.setItem(STORAGE_KEY, fromUrl); } catch { /* sin almacenamiento: solo esta página */ }
    return fromUrl;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.includes(saved)) return saved;
  } catch { /* modo privado o almacenamiento bloqueado */ }
  return 'es';
}

export const lang = readLang();
export const locale = lang === 'en' ? 'en-GB' : 'es-ES';

// El diccionario solo se descarga si hace falta.
const DICT = lang === 'en' ? (await import('../i18n/en.js')).default : null;
const EXACT = DICT ? new Map(Object.entries(DICT.exact)) : new Map();
const PATTERNS = DICT ? DICT.patterns : [];

const norm = s => s.replace(/\s+/g, ' ').trim();
const HAS_LETTERS = /\p{L}/u;

/** Traduce un texto. Si no hay traducción devuelve el texto tal cual. */
export function t(text) {
  if (!DICT || text == null) return text;
  const r = lookup(norm(String(text)));
  return r ?? text;
}

function lookup(key) {
  if (!key || !HAS_LETTERS.test(key)) return null;
  const hit = EXACT.get(key);
  if (hit !== undefined) return hit;
  for (const [re, to] of PATTERNS) {
    const m = key.match(re);
    if (m) return typeof to === 'function' ? to(m, x => lookup(norm(x)) ?? x) : key.replace(re, to);
  }
  if (window.__i18nMisses) window.__i18nMisses.add(key);
  return null;
}

/**
 * Textos originales (en español) cuya traducción contiene `query`.
 * Sirve para buscar en el catálogo escribiendo el nombre en inglés.
 */
export function originalsMatching(query, max = 25) {
  if (!DICT || !query) return [];
  const fold = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const q = fold(query);
  const out = [];
  for (const [es, en] of EXACT) {
    if (fold(en).includes(q)) out.push(es);
    if (out.length >= max) break;
  }
  return out;
}

// ---------- Traducción del DOM ----------
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);
const ATTRS = ['placeholder', 'aria-label', 'alt', 'title'];
const written = new WeakMap(); // nodo -> texto que pusimos nosotros (evita bucles)

function skipped(el) {
  return el?.closest?.('[translate="no"]') != null;
}

function translateTextNode(node) {
  const value = node.nodeValue;
  if (written.get(node) === value) return;
  const parent = node.parentElement;
  if (!parent || SKIP.has(parent.tagName) || skipped(parent)) return;
  const key = norm(value);
  const r = lookup(key);
  if (r == null || r === key) return;
  const lead = value.match(/^\s*/)[0];
  const trail = value.match(/\s*$/)[0];
  const next = lead + r + trail;
  written.set(node, next);
  node.nodeValue = next;
}

function translateAttr(el, name) {
  const value = el.getAttribute(name);
  if (value == null || written.get(el)?.[name] === value) return;
  const r = lookup(norm(value));
  if (r == null || r === value) return;
  const marks = written.get(el) ?? {};
  marks[name] = r;
  written.set(el, marks);
  el.setAttribute(name, r);
}

function translateElement(el) {
  if (skipped(el)) return;
  for (const a of ATTRS) if (el.hasAttribute(a)) translateAttr(el, a);
  if (el.tagName === 'INPUT' && ['submit', 'button'].includes(el.type) && el.value) {
    const r = lookup(norm(el.value));
    if (r) el.value = r;
  }
}

function translateTree(root) {
  if (root.nodeType === Node.TEXT_NODE) return translateTextNode(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (SKIP.has(root.tagName) || skipped(root)) return;
  translateElement(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        if (SKIP.has(n.tagName) || n.getAttribute('translate') === 'no') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const texts = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) texts.push(n); else translateElement(n);
  }
  texts.forEach(translateTextNode);
}

function translateTitle() {
  const r = lookup(norm(document.title));
  if (r && r !== document.title) document.title = r;
}

// ---------- Selector de idioma ----------
/** HTML del selector ES | EN (lo usan las cabeceras). */
export function langSwitchHtml() {
  const link = (code, label, name) =>
    `<a href="?lang=${code}" data-set-lang="${code}" hreflang="${code}" lang="${code}" title="${name}"
        ${code === lang ? 'aria-current="true"' : ''}>${label}</a>`;
  return `<span class="lang-switch" translate="no" role="group" aria-label="${lang === 'en' ? 'Language' : 'Idioma'}">
      ${link('es', 'ES', 'Español')}<span aria-hidden="true">|</span>${link('en', 'EN', 'English')}</span>`;
}

document.addEventListener('click', e => {
  const a = e.target.closest?.('[data-set-lang]');
  if (!a) return;
  e.preventDefault();
  const url = new URL(location.href);
  url.searchParams.set('lang', a.dataset.setLang);
  location.href = url.toString();
});

// Páginas sin cabecera (acceso al back-office, 404): el selector va en la franja superior.
function ensureSwitch() {
  if (document.getElementById('site-header') || document.querySelector('.lang-switch')) return;
  const host = document.querySelector('.academic-banner') ?? document.body;
  host.insertAdjacentHTML('beforeend', ` ${langSwitchHtml()}`);
}

// ---------- Arranque ----------
document.documentElement.lang = lang;
if (DICT) {
  translateTree(document.body);
  translateTitle();
  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach(translateTree);
      else if (r.type === 'characterData') translateTextNode(r.target);
      else if (r.type === 'attributes' && !skipped(r.target)) translateAttr(r.target, r.attributeName);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  new MutationObserver(translateTitle).observe(document.querySelector('title') ?? document.head, { childList: true, characterData: true, subtree: true });
}
// tras pintar la cabecera (renderLayout se ejecuta en el script de la página)
queueMicrotask(() => setTimeout(ensureSwitch, 0));
