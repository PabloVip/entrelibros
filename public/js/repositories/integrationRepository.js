// Integración con el back-office (Tarea 2): métricas, ERP, decisiones del agente, cola y log.
// Todo se lee con funciones que comprueban que el usuario es administrador (14_integracion.sql).
import { supabase } from '../core/supabase.js';

export async function integrationDashboard(days) {
  const { data, error } = await supabase.rpc('admin_integration_dashboard', { p_days: days });
  if (error) throw error;
  return data;
}

export async function integrationLists(limit = 50) {
  const { data, error } = await supabase.rpc('admin_integration_lists', { p_limit: limit });
  if (error) throw error;
  return data;
}

export async function retryOutbox(id) {
  const { data, error } = await supabase.rpc('admin_integration_retry', { p_id: id });
  if (error) throw error;
  return data;
}
