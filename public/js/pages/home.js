// Portada TEMPORAL: comprueba la conexión con Supabase. Se sustituye por la portada real.
import { renderLayout } from '../core/layout.js';
import { supabase } from '../core/supabase.js';

renderLayout();

const box = document.getElementById('db-status');

async function checkConnection() {
  const tables = ['themes', 'products', 'product_variants', 'shipping_methods'];
  const results = await Promise.all(
    tables.map(t => supabase.from(t).select('*', { count: 'exact', head: true }))
  );

  const failed = results.find(r => r.error);
  if (failed) {
    box.className = 'status error';
    box.textContent = `Error de conexión: ${failed.error.message}`;
    return;
  }

  box.className = 'status ok';
  box.textContent = 'Conexión correcta · ' +
    tables.map((t, i) => `${t}: ${results[i].count}`).join(' · ');
}

checkConnection().catch(err => {
  box.className = 'status error';
  box.textContent = `Error de conexión: ${err.message}`;
});
