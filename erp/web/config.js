// Configuración pública del BACK-OFFICE ERP/CRM (proyecto de Supabase «entrelibros-erp»).
// Es un proyecto distinto del de la tienda: otra base de datos, otras claves y otros usuarios.
// La "publishable key" puede ir en el navegador (no es un secreto): la seguridad la dan las
// políticas RLS de erp/supabase/01_erp.sql (solo el personal dado de alta en «staff» puede leer).
// NUNCA pongas aquí la "secret key": esa solo la tiene n8n.
export const ERP_URL = 'https://eogmvcfhwhxqarnrogeh.supabase.co';
export const ERP_PUBLISHABLE_KEY = 'sb_publishable_e9jWSw3kQeYQtT7Yzd8QVg_iNmad2s6';

// Solo para enlazar a la tienda desde la cabecera (este sistema no accede a sus datos)
export const SHOP_URL = 'https://pablovip.github.io/entrelibros/';
