// Selector de punto de recogida (checkout, envío "Recogida en punto de entrega"): mapa + lista.
// Los puntos están en la tabla pickup_points (supabase/12_puntos_entrega.sql).
//
// Mapa: Leaflet con los mapas de OpenStreetMap. La librería solo se descarga cuando el cliente
// elige este envío (con su hash de integridad). Si no carga (sin conexión), la lista sigue sirviendo.
import { escapeHtml } from '../core/utils.js';
import { lang } from '../core/i18n.js';

const LEAFLET = {
  js:  { url: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js', sri: 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH' },
  css: { url: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css', sri: 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H' },
};
const SPAIN = { center: [40.2, -3.6], zoom: 5 };

let leafletLoading = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leafletLoading ??= new Promise((resolve, reject) => {
    const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: LEAFLET.css.url, integrity: LEAFLET.css.sri, crossOrigin: 'anonymous' });
    const js = Object.assign(document.createElement('script'), { src: LEAFLET.js.url, integrity: LEAFLET.js.sri, crossOrigin: 'anonymous' });
    js.onload = () => (window.L ? resolve(window.L) : reject(new Error('Leaflet no disponible')));
    js.onerror = () => { leafletLoading = null; js.remove(); reject(new Error('No se ha podido cargar el mapa')); };
    document.head.append(css, js);
  });
  return leafletLoading;
}

/** Distancia en km entre dos coordenadas (fórmula del semiverseno). */
function km(a, b) {
  const rad = x => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
const kmText = d => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toLocaleString(lang === 'en' ? 'en-GB' : 'es-ES', { maximumFractionDigits: d < 10 ? 1 : 0 })} km`);
const fold = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Pinta el selector dentro de `container`.
 * @param {Array} points  puntos activos (code, name, address, postcode, city, province, lat, lng, hours)
 * @param {{postcode?: string, onChange: (point|null) => void}} opts
 * @returns {{ selected: () => object|null, refresh: () => void }}
 */
export function mountPickupPicker(container, points, { postcode = '', onChange }) {
  let selected = null;
  let origin = null;   // ubicación del cliente (si la comparte)
  let map = null;
  const markers = new Map();
  const all = points.map(p => ({ ...p, lat: Number(p.lat), lng: Number(p.lng) }));

  container.innerHTML = `
    <div class="pickup">
      <div class="pickup-tools">
        <label class="visually-hidden" for="pickup-q">Buscar un punto por ciudad o código postal</label>
        <input id="pickup-q" type="search" placeholder="Ciudad o código postal" autocomplete="off">
        <button type="button" class="btn btn-small btn-secondary" id="pickup-geo">Usar mi ubicación</button>
      </div>
      <p id="pickup-msg" class="form-msg" role="status"></p>
      <div class="pickup-body">
        <div id="pickup-map" class="pickup-map" role="region" aria-label="Mapa de puntos de recogida"><p class="muted small">Cargando el mapa…</p></div>
        <ul id="pickup-list" class="pickup-list plain" aria-label="Puntos de recogida"></ul>
      </div>
    </div>`;
  const list = container.querySelector('#pickup-list');
  const q = container.querySelector('#pickup-q');
  const msg = container.querySelector('#pickup-msg');

  // Orden: por distancia si hay ubicación; si no, primero los de la provincia del código postal
  // (las 2 primeras cifras del CP son la provincia) y después por ciudad.
  function ordered() {
    const text = fold(q.value.trim());
    let rows = all.filter(p => !text || [p.city, p.province, p.postcode, p.name, p.address].some(v => fold(v).includes(text)));
    if (origin) rows = rows.map(p => ({ ...p, dist: km(origin, p) })).sort((a, b) => a.dist - b.dist);
    else {
      const prov = /^[0-9]{2}/.test(postcode) ? postcode.slice(0, 2) : '';
      rows.sort((a, b) => (b.postcode.startsWith(prov) && prov ? 1 : 0) - (a.postcode.startsWith(prov) && prov ? 1 : 0)
        || a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
    }
    return rows;
  }

  function renderList() {
    const rows = ordered();
    list.innerHTML = rows.length ? rows.map(p => `
      <li>
        <label class="pickup-item ${selected?.code === p.code ? 'is-selected' : ''}">
          <input type="radio" name="pickup_point" value="${escapeHtml(p.code)}" ${selected?.code === p.code ? 'checked' : ''}>
          <span class="pickup-text">
            <strong>${escapeHtml(p.name)}</strong>
            <span>${escapeHtml(p.address)} · ${escapeHtml(p.postcode)} ${escapeHtml(p.city)}</span>
            <small class="muted">${escapeHtml(p.hours)}</small>
          </span>
          ${p.dist != null ? `<span class="pickup-dist">${escapeHtml(kmText(p.dist))}</span>` : ''}
        </label>
      </li>`).join('')
      : '<li class="muted small">No hay puntos de recogida con esa búsqueda.</li>';
    // en el mapa solo se ven los que salen en la lista
    if (map) {
      for (const [code, m] of markers) {
        const visible = rows.some(p => p.code === code);
        if (visible && !map.hasLayer(m)) m.addTo(map);
        if (!visible && map.hasLayer(m)) m.remove();
      }
    }
  }

  function pinIcon(L, active) {
    return L.divIcon({ className: `pickup-pin ${active ? 'is-active' : ''}`, html: '<span></span>', iconSize: [26, 34], iconAnchor: [13, 32], popupAnchor: [0, -28] });
  }

  function select(code, { fromMap = false } = {}) {
    selected = all.find(p => p.code === code) ?? null;
    renderList();
    if (map && window.L) {
      for (const [c, m] of markers) m.setIcon(pinIcon(window.L, c === code));
      const m = markers.get(code);
      if (m && selected) {
        if (!fromMap) map.setView([selected.lat, selected.lng], Math.max(map.getZoom(), 14));
        m.openPopup();
      }
    }
    if (selected) list.querySelector(`input[value="${CSS.escape(selected.code)}"]`)?.closest('li')?.scrollIntoView({ block: 'nearest' });
    onChange(selected);
  }

  function fitTo(rows) {
    if (!map || !rows.length) return;
    if (rows.length === 1) map.setView([rows[0].lat, rows[0].lng], 14);
    else map.fitBounds(rows.map(p => [p.lat, p.lng]), { padding: [30, 30], maxZoom: 13 });
  }

  list.addEventListener('change', e => { if (e.target.name === 'pickup_point') select(e.target.value); });
  let timer;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { renderList(); if (q.value.trim()) fitTo(ordered()); }, 200);
  });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); }); // no envía el pedido

  container.querySelector('#pickup-geo').addEventListener('click', () => {
    if (!navigator.geolocation) { msg.textContent = 'Tu navegador no permite compartir la ubicación.'; msg.className = 'form-msg error'; return; }
    msg.textContent = 'Buscando los puntos más cercanos…';
    msg.className = 'form-msg';
    navigator.geolocation.getCurrentPosition(pos => {
      origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      q.value = '';
      renderList();
      const near = ordered().slice(0, 3);
      msg.textContent = near.length ? `El más cercano está a ${kmText(near[0].dist)}.` : '';
      msg.className = 'form-msg ok';
      if (map && window.L) {
        window.L.circleMarker([origin.lat, origin.lng], { radius: 7, color: '#2E6B45', fillOpacity: 0.9 }).addTo(map);
        fitTo([origin, ...near]);
      }
    }, () => {
      msg.textContent = 'No se ha podido obtener tu ubicación. Busca por ciudad o código postal.';
      msg.className = 'form-msg error';
    }, { timeout: 10000, maximumAge: 600000 });
  });

  renderList();

  loadLeaflet().then(L => {
    const el = container.querySelector('#pickup-map');
    el.innerHTML = '';
    map = L.map(el, { scrollWheelZoom: false }).setView(SPAIN.center, SPAIN.zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    for (const p of all) {
      const m = L.marker([p.lat, p.lng], { icon: pinIcon(L, selected?.code === p.code), title: p.name, keyboard: false })
        .bindPopup(`<strong>${escapeHtml(p.name)}</strong><br>${escapeHtml(p.address)}<br>${escapeHtml(p.postcode)} ${escapeHtml(p.city)}<br><small>${escapeHtml(p.hours)}</small>`)
        .on('click', () => select(p.code, { fromMap: true }));
      markers.set(p.code, m);
    }
    renderList();
    fitTo(ordered().slice(0, /^[0-9]{2}/.test(postcode) ? 3 : all.length));
  }).catch(() => {
    container.querySelector('#pickup-map').innerHTML = '<p class="muted small">No se ha podido cargar el mapa. Elige el punto en la lista.</p>';
  });

  return {
    selected: () => selected,
    // el mapa necesita recalcular su tamaño cuando el bloque pasa de oculto a visible
    refresh: () => map?.invalidateSize(),
  };
}
