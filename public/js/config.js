// Configuración pública del proyecto Supabase.
// La "publishable key" (o anon key) está pensada para ir en el navegador:
// NO es un secreto. La seguridad la dan las políticas RLS (supabase/02_policies.sql).
// NUNCA pongas aquí la "secret key" / service_role.
export const SUPABASE_URL = 'https://yzchgbvsctobbaapdcbn.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_4cK1DWZaU9lCOMwYoE6lQA_CocoZyt-';

export const APP_NAME = 'Entrelibros';
export const TAX_RATE = 21; // IVA general (%) — solo para mostrar; el cálculo real lo hace el servidor

// Bot de Telegram de soporte (Tarea 2). Solo el nombre de usuario, sin @ (no es un secreto).
// Vacío = no se ofrece seguir la incidencia por Telegram.
export const TELEGRAM_BOT = '';
