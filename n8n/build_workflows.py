#!/usr/bin/env python3
"""Genera los tres workflows de n8n de Entrelibros (Tarea 2) en n8n/workflows/*.json.

Se mantienen como código para poder revisarlos en el repositorio (diff legible) y regenerarlos;
lo que se importa en n8n son los .json. Las credenciales van por nombre: al importar, n8n pide
asociarlas a las credenciales creadas en la instancia (nunca se exportan secretos).

Uso: python3 n8n/build_workflows.py
"""
import json
import pathlib
import uuid

ROOT = pathlib.Path(__file__).resolve().parent
CODE = ROOT / 'code'
OUT = ROOT / 'workflows'
OUT.mkdir(exist_ok=True)

CRED = {
    'supabase': {'httpHeaderAuth': {'id': 'entrelibrosSupabase', 'name': 'Entrelibros · Supabase (secret key)'}},
    'webhook': {'httpHeaderAuth': {'id': 'entrelibrosWebhookKey', 'name': 'Entrelibros · Webhook key'}},
    'telegram': {'telegramApi': {'id': 'entrelibrosTelegram', 'name': 'Entrelibros · Telegram bot'}},
    'gemini': {'googlePalmApi': {'id': 'entrelibrosGemini', 'name': 'Entrelibros · Gemini'}},
}
WF_IDS = {'main': 'EntrelibrosEventosERP', 'agent': 'EntrelibrosAgenteSoporte', 'bot': 'EntrelibrosBotTelegram'}
SUPA = '{{ $env.ENTRELIBROS_SUPABASE_URL }}/rest/v1/rpc/'
# Escapa texto dinámico para los mensajes de Telegram en HTML (un "<" sin escapar hace fallar el envío)
ESC = ".replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')"
OPS = '={{ $env.ENTRELIBROS_OPS_CHAT_ID }}'


def nid(name):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'entrelibros/' + name))


class WF:
    def __init__(self, key, name):
        self.key, self.name, self.nodes, self.conn = key, name, [], {}

    def add(self, name, type_, version, params, pos, creds=None, **extra):
        n = {'parameters': params, 'id': nid(self.key + '/' + name), 'name': name, 'type': type_,
             'typeVersion': version, 'position': list(pos)}
        if creds:
            n['credentials'] = {k: v for c in creds for k, v in CRED[c].items()}
        n.update(extra)
        self.nodes.append(n)
        return name

    def link(self, a, b, out=0, kind='main', inp=0):
        lst = self.conn.setdefault(a, {}).setdefault(kind, [])
        while len(lst) <= out:
            lst.append([])
        lst[out].append({'node': b, 'type': kind, 'index': inp})

    def chain(self, *names):
        for a, b in zip(names, names[1:]):
            self.link(a, b)

    def save(self, file, description):
        wf = {'id': WF_IDS[self.key], 'name': self.name, 'nodes': self.nodes, 'connections': self.conn,
              'active': False, 'settings': {'executionOrder': 'v1', 'saveManualExecutions': True,
                                            'saveDataSuccessExecution': 'all', 'saveDataErrorExecution': 'all',
                                            'timezone': 'Europe/Madrid', 'executionTimeout': 300},
              'pinData': {}, 'meta': {'templateCredsSetupCompleted': False},
              'tags': [], 'description': description}
        (OUT / file).write_text(json.dumps(wf, ensure_ascii=False, indent=2) + '\n')
        print('ok', file, len(self.nodes), 'nodos')


# ---------------------------------------------------------------- utilidades de nodos
def rpc(wf, name, fn, body_expr, pos, on_error=None, notes=None):
    """POST a una función de Supabase (PostgREST /rpc) con la clave secreta (credencial Header Auth)."""
    extra = {}
    if on_error:
        extra['onError'] = on_error
    if notes:
        extra['notes'] = notes
        extra['notesInFlow'] = True
    return wf.add(name, 'n8n-nodes-base.httpRequest', 4.2, {
        'method': 'POST', 'url': '=' + SUPA + fn,
        'authentication': 'genericCredentialType', 'genericAuthType': 'httpHeaderAuth',
        'sendBody': True, 'specifyBody': 'json', 'jsonBody': '={{ JSON.stringify(' + body_expr + ') }}',
        'options': {'timeout': 15000},
    }, pos, creds=['supabase'], **extra)


def code(wf, name, js, pos, **extra):
    return wf.add(name, 'n8n-nodes-base.code', 2, {'jsCode': js}, pos, **extra)


def cond(left, op_type, operation, right=None):
    c = {'id': nid(left + operation + str(right)), 'leftValue': left,
         'operator': {'type': op_type, 'operation': operation}}
    if right is None:
        c['operator']['singleValue'] = True
        c['rightValue'] = ''
    else:
        c['rightValue'] = right
    return c


def if_node(wf, name, conditions, pos, combinator='and'):
    return wf.add(name, 'n8n-nodes-base.if', 2.2, {
        'conditions': {'options': {'caseSensitive': True, 'leftValue': '', 'typeValidation': 'loose', 'version': 2},
                       'conditions': conditions, 'combinator': combinator},
        'looseTypeValidation': True, 'options': {}}, pos)


def telegram(wf, name, chat, text, pos, on_error='continueRegularOutput'):
    return wf.add(name, 'n8n-nodes-base.telegram', 1.2, {
        'chatId': chat, 'text': text,
        'additionalFields': {'appendAttribution': False, 'parse_mode': 'HTML'}},
        pos, creds=['telegram'], onError=on_error, webhookId=nid(wf.key + '/' + name + '/wh'))


def log_body(workflow, step, extra):
    return ("{ p_entry: { execution_id: $execution.id, workflow: '" + workflow + "', step: '" + step + "', "
            + extra + " } }")


# ======================================================================================
# 1. Workflow principal: eventos de la tienda → validación → ERP/CRM → log → ACK
# ======================================================================================
m = WF('main', 'Entrelibros · Eventos de la tienda → ERP')
validate_js = (CODE / 'validar-evento.js').read_text()

m.add('Webhook · evento de la tienda', 'n8n-nodes-base.webhook', 2, {
    'httpMethod': 'POST', 'path': 'entrelibros/eventos', 'authentication': 'headerAuth',
    'responseMode': 'responseNode', 'options': {}}, (0, 300), creds=['webhook'],
    webhookId='5f0c4f8e-7a2e-4c3b-9d4a-0e7c1b2a3f40',
    notes='Lo llama Supabase (pg_net) con el contrato entrelibros.event.v1 y la cabecera X-Entrelibros-Key.',
    notesInFlow=True)
code(m, 'Validar y normalizar', validate_js, (240, 300),
     notes='Campos obligatorios, formatos, coherencia de importes y normalización (ver n8n/code/validar-evento.js).',
     notesInFlow=True)
if_node(m, '¿Payload válido?', [cond('={{ $json.valid }}', 'boolean', 'true')], (480, 300))

m.add('Según el tipo de evento', 'n8n-nodes-base.switch', 3.2, {
    'rules': {'values': [
        {'conditions': {'options': {'caseSensitive': True, 'leftValue': '', 'typeValidation': 'strict', 'version': 2},
                        'conditions': [cond('={{ $json.route }}', 'string', 'equals', r)], 'combinator': 'and'},
         'renameOutput': True, 'outputKey': label}
        for r, label in (('order', 'Pedido'), ('stock', 'Stock'), ('ticket', 'Incidencia'))]},
    'options': {}}, (720, 200))

V = "$('Validar y normalizar').item.json"
rpc(m, 'ERP · pedido de venta', 'erp_upsert_order',
    '{ p_event_id: ' + V + '.event.event_id, p_occurred_at: ' + V + '.event.occurred_at, p_order: ' + V + '.normalized }',
    (980, 60), on_error='continueErrorOutput', notes='Escenarios 1 y 2: crea o actualiza el pedido (idempotente).')
rpc(m, 'ERP · inventario', 'erp_set_stock',
    '{ p_event_id: ' + V + '.event.event_id, p_sku: ' + V + '.normalized.sku, p_on_hand: ' + V
    + '.normalized.on_hand, p_description: ' + V + '.normalized.description }',
    (980, 220), on_error='continueErrorOutput', notes='Escenario 2: sincroniza el stock.')
rpc(m, 'CRM · incidencia', 'erp_upsert_ticket',
    '{ p_event_id: ' + V + '.event.event_id, p_ticket: ' + V + '.normalized }',
    (980, 380), on_error='continueErrorOutput', notes='Escenario 3: ticket asociado a cliente y pedido.')

code(m, 'Preparar resultado', r"""// Une la respuesta del ERP con los datos del evento y decide los pasos siguientes.
const v = $('Validar y normalizar').item.json;
const r = $json;                                   // respuesta de la función erp_*
const result = r.result ?? 'ok';
const status = ['duplicado', 'obsoleto'].includes(result) ? result : 'ok';
const ev = v.event.event_type;
const paid = ev === 'payment.simulated' && v.normalized?.payment?.status_erp === 'pagado';
const fmt = n => Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let notice = null;
if (status === 'ok' && paid) {
  notice = `🧾 <b>Pedido pagado integrado en el ERP</b>\n${v.entity_ref} · ${fmt(v.normalized.amounts.total)} · ${v.normalized.lines.length} líneas\nCliente: ${esc(v.normalized.customer.email)}`;
} else if (status === 'ok' && ev === 'order.status_changed') {
  notice = `🔄 <b>Estado sincronizado</b>\n${v.entity_ref}: ${r.previous_status ?? '—'} → ${r.status}`;
} else if (status === 'ok' && ev === 'stock.adjusted') {
  notice = `📦 <b>Stock sincronizado</b>\n${v.entity_ref}: ${r.from ?? '—'} → ${r.on_hand} uds.`;
} else if (status === 'ok' && ev === 'support.requested') {
  notice = `🆘 <b>Nueva incidencia en el CRM</b>\n${v.entity_ref} · ${esc(v.normalized.category)} · prioridad ${v.normalized.priority}\nEl agente de IA la está analizando…`;
}
return [{ json: {
  status, result, erp: r,
  event_id: v.event.event_id, event_type: ev, entity_ref: v.entity_ref, route: v.route,
  launch_agent: status === 'ok' && result === 'creado' && ev === 'support.requested',
  agent_input: { event: v.event, ticket: v.normalized, parent_execution: $execution.id },
  notice,
  duration_ms: Date.now() - v.started_at,
} }];""", (1240, 220))

rpc(m, 'Log · resultado', 'erp_log',
    log_body('eventos-erp', 'resultado', "event_id: $json.event_id, event_type: $json.event_type, entity_type: $json.route, "
             "entity_ref: $json.entity_ref, status: $json.status, message: 'ERP: ' + $json.result, details: $json.erp, "
             "duration_ms: $json.duration_ms"), (1480, 220), on_error='continueRegularOutput')
rpc(m, 'ACK correcto', 'erp_ack',
    "{ p_event_id: $('Preparar resultado').item.json.event_id, p_ok: true, p_detail: $('Preparar resultado').item.json.result }",
    (1720, 220), on_error='continueRegularOutput')
m.add('Responder 200', 'n8n-nodes-base.respondToWebhook', 1.1, {
    'respondWith': 'json',
    'responseBody': "={{ JSON.stringify({ result: $('Preparar resultado').item.json.result, event_id: $('Preparar resultado').item.json.event_id, execution_id: $execution.id }) }}",
    'options': {'responseCode': 200}}, (1960, 120))
if_node(m, '¿Avisar a operaciones?', [cond("={{ $('Preparar resultado').item.json.notice }}", 'string', 'notEmpty')], (1960, 300))
telegram(m, 'Telegram · aviso a operaciones', OPS, "={{ $('Preparar resultado').item.json.notice }}", (2200, 280))
if_node(m, '¿Incidencia nueva?', [cond("={{ $('Preparar resultado').item.json.launch_agent }}", 'boolean', 'true')], (2440, 280))
m.add('Lanzar agente de soporte', 'n8n-nodes-base.executeWorkflow', 1.2, {
    'source': 'database', 'workflowId': {'__rl': True, 'value': WF_IDS['agent'], 'mode': 'id'},
    'mode': 'each', 'options': {'waitForSubWorkflow': False}}, (2680, 260))
code(m, 'Datos para el agente', "return [{ json: $('Preparar resultado').item.json.agent_input }];", (2560, 420))

# --- errores ---
code(m, 'Error de validación', r"""const v = $json;
return [{ json: {
  event_id: v.event.event_id, event_type: v.event.event_type, entity_ref: v.entity_ref,
  error_type: v.error_type ?? 'contrato', retry: false, http_code: 422,
  message: v.errors.map(e => `${e.field}: ${e.message}`).join(' · '),
  details: { errors: v.errors }, duration_ms: Date.now() - v.started_at,
} }];""", (720, 560))
code(m, 'Clasificar error del ERP', r"""// Error de la llamada al ERP: 4xx con prefijo de negocio = datos (no se reintenta);
// sin respuesta, 5xx o timeout = técnico (se reintenta desde la cola de Supabase).
const v = $('Validar y normalizar').item.json;
const err = $json.error ?? {};
const msg = String(err.message ?? err.description ?? JSON.stringify(err)).slice(0, 500);
const code = Number(err.httpCode ?? err.status ?? 0);
const m = msg.match(/(contrato|formato|coherencia|negocio):/);
const type = m ? m[1] : (code >= 400 && code < 500 ? 'negocio' : 'tecnico');
return [{ json: {
  event_id: v.event.event_id, event_type: v.event.event_type, entity_ref: v.entity_ref,
  error_type: type, retry: type === 'tecnico', http_code: type === 'tecnico' ? 503 : 422,
  message: msg, details: { http_code: code || null }, duration_ms: Date.now() - v.started_at,
} }];""", (1240, 560))
U = "$('Unir errores').item.json"
rpc(m, 'Log · error', 'erp_log', log_body('eventos-erp', 'resultado',
    "event_id: " + U + ".event_id, event_type: " + U + ".event_type, entity_ref: " + U + ".entity_ref, status: 'error', "
    "error_type: " + U + ".error_type, message: " + U + ".message, details: " + U + ".details, duration_ms: " + U + ".duration_ms"),
    (1480, 560), on_error='continueRegularOutput')
rpc(m, 'ACK con error', 'erp_ack',
    "{ p_event_id: " + U + ".event_id || '00000000-0000-0000-0000-000000000000', p_ok: false, "
    "p_detail: " + U + ".error_type + ': ' + " + U + ".message, p_retry: " + U + ".retry }",
    (1720, 560), on_error='continueRegularOutput')
m.add('Unir errores', 'n8n-nodes-base.noOp', 1, {}, (1360, 660))
telegram(m, 'Telegram · alerta de error', OPS,
         "=⚠️ <b>Error de integración</b> ({{ $('Unir errores').item.json.error_type }})\n"
         "{{ $('Unir errores').item.json.event_type }} · {{ $('Unir errores').item.json.entity_ref }}\n"
         "{{ $('Unir errores').item.json.message.slice(0, 300)" + ESC + " }}\n"
         "{{ $('Unir errores').item.json.retry ? 'Se reintentará automáticamente.' : 'No se reintenta: revisar los datos.' }}",
         (1960, 560))
m.add('Responder error', 'n8n-nodes-base.respondToWebhook', 1.1, {
    'respondWith': 'json',
    'responseBody': "={{ JSON.stringify({ result: 'error', error_type: $('Unir errores').item.json.error_type, message: $('Unir errores').item.json.message, event_id: $('Unir errores').item.json.event_id, execution_id: $execution.id }) }}",
    'options': {'responseCode': "={{ $('Unir errores').item.json.http_code }}"}}, (1960, 720))

m.chain('Webhook · evento de la tienda', 'Validar y normalizar', '¿Payload válido?')
m.link('¿Payload válido?', 'Según el tipo de evento', 0)
m.link('¿Payload válido?', 'Error de validación', 1)
for i, n in enumerate(('ERP · pedido de venta', 'ERP · inventario', 'CRM · incidencia')):
    m.link('Según el tipo de evento', n, i)
    m.link(n, 'Preparar resultado', 0)
    m.link(n, 'Clasificar error del ERP', 1)
m.chain('Preparar resultado', 'Log · resultado', 'ACK correcto')
m.link('ACK correcto', 'Responder 200')
m.link('ACK correcto', '¿Avisar a operaciones?')
m.link('¿Avisar a operaciones?', 'Telegram · aviso a operaciones', 0)
m.link('¿Avisar a operaciones?', '¿Incidencia nueva?', 1)
m.link('Telegram · aviso a operaciones', '¿Incidencia nueva?')
m.link('¿Incidencia nueva?', 'Datos para el agente', 0)
m.link('Datos para el agente', 'Lanzar agente de soporte')
m.link('Error de validación', 'Unir errores')
m.link('Clasificar error del ERP', 'Unir errores')
m.chain('Unir errores', 'Log · error', 'ACK con error')
m.link('ACK con error', 'Responder error')
m.link('ACK con error', 'Telegram · alerta de error')
m.save('1-eventos-erp.json', 'Recibe los eventos de la tienda (webhook), valida el contrato, crea o actualiza el pedido, '
       'el stock o la incidencia en el ERP/CRM, registra el resultado y confirma a Supabase. Rama de error con log y alerta.')

# ======================================================================================
# 2. Agente de soporte (IA agéntica supervisada)
# ======================================================================================
a = WF('agent', 'Entrelibros · Agente de soporte (IA supervisada)')
prompt = (ROOT / 'prompts' / 'agente-soporte.md').read_text()
system = prompt.split('```text\n', 1)[1].split('```', 1)[0].strip()

a.add('Desde el flujo principal', 'n8n-nodes-base.executeWorkflowTrigger', 1.1, {'inputSource': 'passthrough'}, (0, 300))
a.add('Agente de soporte', '@n8n/n8n-nodes-langchain.agent', 1.9, {
    'promptType': 'define',
    'text': ("=Incidencia {{ $json.ticket.ticket_number }} ({{ $json.ticket.category }}) recibida el {{ $json.ticket.sla_due_at ? $now.toISO() : '' }}.\n"
             "Cliente: {{ $json.ticket.customer_email }}. Pedido: {{ $json.ticket.order_number || 'sin pedido' }}.\n"
             "Motivo: {{ $json.ticket.reason }}. Mensaje del cliente:\n\"\"\"{{ $json.ticket.message }}\"\"\""),
    'hasOutputParser': False,
    'options': {'systemMessage': system, 'maxIterations': 6, 'returnIntermediateSteps': True}},
    (260, 300), onError='continueErrorOutput', retryOnFail=True, maxTries=3, waitBetweenTries=5000)
a.add('Gemini', '@n8n/n8n-nodes-langchain.lmChatGoogleGemini', 1, {
    'modelName': 'models/gemini-3.1-flash-lite', 'options': {'temperature': 0.2, 'maxOutputTokens': 2048}},
    (120, 540), creds=['gemini'])

TOOLS = [
    ('consultar_pedido', 'erp_tool_order', "{ p_order_number: $fromAI('order_number', 'Número de pedido con formato EL-AAAAMMDD-XXXX', 'string') }",
     'Consulta un pedido de la tienda y del ERP: estado, líneas (SKU), historial de estados, envío y días desde la compra.'),
    ('consultar_cliente', 'erp_tool_customer', "{ p_email: $fromAI('email', 'Email del cliente', 'string') }",
     'Consulta el historial del cliente por email: pedidos anteriores e incidencias previas.'),
    ('consultar_stock', 'erp_tool_stock', "{ p_query: $fromAI('query', 'SKU o nombre del producto o recambio', 'string') }",
     'Consulta el stock disponible de las variantes cuyo SKU o nombre contiene el texto indicado.'),
    ('crear_nota_interna', 'erp_tool_internal_note', "{ p_ticket: $fromAI('ticket', 'Número de incidencia SOP-AAAAMMDD-XXXX', 'string'), p_note: $fromAI('note', 'Resumen breve de lo comprobado', 'string') }",
     'Acción reversible: añade una nota interna (no visible para el cliente) al ticket del CRM con lo que has comprobado.'),
]
for i, (tname, fn, body, desc) in enumerate(TOOLS):
    a.add(tname, 'n8n-nodes-base.httpRequestTool', 4.2, {
        'toolDescription': desc, 'method': 'POST', 'url': '=' + SUPA + fn,
        'authentication': 'genericCredentialType', 'genericAuthType': 'httpHeaderAuth',
        'sendBody': True, 'specifyBody': 'json', 'jsonBody': '={{ JSON.stringify(' + body + ') }}',
        'options': {'timeout': 10000}}, (300 + i * 150, 560), creds=['supabase'])
    a.link(tname, 'Agente de soporte', kind='ai_tool')

SCHEMA = {
    'type': 'object',
    'required': ['case_type', 'priority', 'confidence', 'proposed_action', 'action_type', 'justification', 'risks', 'consulted', 'tools_used'],
    'properties': {
        'case_type': {'type': 'string', 'enum': ['pieza_faltante', 'pieza_danada', 'retraso_envio', 'duda_montaje', 'consulta_general', 'fuera_de_alcance']},
        'priority': {'type': 'string', 'enum': ['baja', 'media', 'alta', 'urgente']},
        'confidence': {'type': 'number', 'minimum': 0, 'maximum': 1},
        'consulted': {'type': 'object', 'description': 'Datos relevantes devueltos por las herramientas'},
        'tools_used': {'type': 'array', 'items': {'type': 'string'}},
        'proposed_action': {'type': 'string'},
        'action_type': {'type': 'string', 'enum': ['enviar_respuesta_cliente', 'reenviar_pieza', 'escalar_a_humano', 'solicitar_informacion']},
        'customer_message': {'type': 'string', 'maxLength': 700},
        'justification': {'type': 'string'},
        'risks': {'type': 'array', 'items': {'type': 'string'}},
    },
}
# Sin Structured Output Parser: con Gemini 3.x la herramienta interna format_final_json_response dejaba la
# ejecución colgada. El agente devuelve el JSON como texto y el nodo Code siguiente lo extrae y lo valida
# contra SCHEMA (mismos campos), así que la salida sigue siendo estructurada y comprobada.
a.link('Gemini', 'Agente de soporte', kind='ai_languageModel')

code(a, 'Comprobar salida del agente', r"""// Barreras sobre la salida del agente antes de guardarla (no se confía a ciegas en el modelo).
const input = $('Desde el flujo principal').item.json;
// El agente devuelve el JSON como texto: se extrae y se valida aquí (si no es JSON válido, se escala a una persona)
function parseOutput(o) {
  if (o && typeof o === 'object') return o;
  const t = String(o ?? '');
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1);
  try { return JSON.parse(raw); } catch { return { _invalid: true, proposed_action: 'Revisar manualmente: la respuesta del agente no era JSON válido', justification: t.slice(0, 300) }; }
}
const out = parseOutput($json.output);
const steps = $json.intermediateSteps ?? [];
const warnings = out._invalid ? ['La salida del agente no era JSON válido'] : [];
const CASES = ['pieza_faltante','pieza_danada','retraso_envio','duda_montaje','consulta_general','fuera_de_alcance'];
const ACTIONS = ['enviar_respuesta_cliente','reenviar_pieza','escalar_a_humano','solicitar_informacion'];
let confidence = Math.min(1, Math.max(0, Number(out.confidence ?? 0)));
let message = String(out.customer_message ?? '').trim();
const used = [...new Set([...(out.tools_used ?? []), ...steps.map(s => s.action?.tool).filter(Boolean)])];
if (!CASES.includes(out.case_type)) warnings.push('case_type no válido: se fuerza a consulta_general');
if (!ACTIONS.includes(out.action_type)) warnings.push('action_type no válido: se escala a humano');
if (!used.some(t => t.startsWith('consultar_'))) { warnings.push('El agente no usó ninguna herramienta de consulta'); confidence = Math.min(confidence, 0.4); }
if (/https?:\/\/|www\./i.test(message)) { warnings.push('El mensaje contenía enlaces: se elimina'); message = message.replace(/\S*(https?:\/\/|www\.)\S*/gi, '[enlace eliminado]'); }
if (/reembols|devoluci[oó]n del dinero|descuento/i.test(message)) warnings.push('El mensaje menciona dinero/reembolso: revisar con cuidado');
if (message.length > 700) { warnings.push('Mensaje recortado a 700 caracteres'); message = message.slice(0, 697) + '…'; }
if (message && !message.includes('(Mensaje de prueba de Entrelibros)')) message += ' (Mensaje de prueba de Entrelibros)';
const action = ACTIONS.includes(out.action_type) ? out.action_type : 'escalar_a_humano';
if (action === 'escalar_a_humano') message = '';
return [{ json: {
  event_id: input.event?.event_id ?? null,
  ticket_ref: input.ticket.ticket_number, order_ref: input.ticket.order_number ?? '',
  case_type: CASES.includes(out.case_type) ? out.case_type : 'consulta_general',
  priority: ['baja','media','alta','urgente'].includes(out.priority) ? out.priority : input.ticket.priority,
  confidence: Math.round(confidence * 100) / 100,
  consulted: out.consulted ?? {}, tools_used: used,
  proposed_action: String(out.proposed_action ?? 'Revisar manualmente').slice(0, 500), action_type: action,
  customer_message: message || null,
  justification: String(out.justification ?? '').slice(0, 1000),
  risks: [...(out.risks ?? []), ...warnings],
  final_status: 'pendiente_revision', model: 'gemini-3.1-flash-lite', execution_id: $execution.id,
  telegram_linked: input.ticket.telegram_linked,
  review_text: reviewText(),
} }];

// Texto para la revisión en Telegram. El nodo «enviar y esperar» usa Markdown (legacy):
// se quitan los caracteres que rompen ese formato (_ * ` [) del texto dinámico.
function reviewText() {
  const md = t => String(t ?? '').replace(/[_*`\[\]]/g, ' ');
  const lines = [
    `${md(input.ticket.ticket_number)}${input.ticket.order_number ? ' · ' + md(input.ticket.order_number) : ''}`,
    `Caso: ${md(CASES.includes(out.case_type) ? out.case_type : 'consulta_general')} · prioridad ${md(out.priority)} · confianza ${Math.round(confidence * 100)} %`,
    `Herramientas: ${md(used.join(', ')) || 'ninguna'}`,
    '',
    `*Acción:* ${md(out.proposed_action ?? 'Revisar manualmente')}`,
    `*Por qué:* ${md(out.justification ?? '—')}`,
    `*Riesgos:* ${md([...(out.risks ?? []), ...warnings].join(' · ') || '—')}`,
    '',
    `*Mensaje para el cliente:*`,
    md(message && action !== 'escalar_a_humano' ? message : '(ninguno: se escala a una persona)'),
    '',
    input.ticket.telegram_linked ? 'El cliente tiene Telegram vinculado.' : 'El cliente aún no ha vinculado Telegram: si apruebas, se le enviará cuando lo vincule.',
  ];
  return lines.join('\n').slice(0, 3800);
}""", (560, 300))
rpc(a, 'Guardar propuesta', 'erp_save_decision', '{ p_d: $json }', (800, 300))
rpc(a, 'Log · propuesta', 'erp_log', log_body('agente-soporte', 'propuesta',
    "event_id: $('Comprobar salida del agente').item.json.event_id, event_type: 'support.requested', entity_type: 'ticket', "
    "entity_ref: $('Comprobar salida del agente').item.json.ticket_ref, status: 'ok', "
    "message: 'Propuesta #' + $('Guardar propuesta').item.json + ' (' + $('Comprobar salida del agente').item.json.case_type + ', confianza ' + $('Comprobar salida del agente').item.json.confidence + ')', "
    "details: { tools_used: $('Comprobar salida del agente').item.json.tools_used, action_type: $('Comprobar salida del agente').item.json.action_type }"),
    (1040, 300), on_error='continueRegularOutput')
D = "$('Comprobar salida del agente').item.json"
a.add('Revisión humana (Telegram)', 'n8n-nodes-base.telegram', 1.2, {
    'operation': 'sendAndWait', 'chatId': OPS,
    'message': "={{ '🤖 *Propuesta #' + $('Guardar propuesta').item.json + ' del agente de IA* · ' + " + D + ".review_text }}",
    'approvalOptions': {'values': {'approvalType': 'double', 'approveLabel': '✅ Aprobar y enviar', 'disapproveLabel': '❌ Rechazar'}},
    'options': {'limitWaitTime': {'values': {'limitType': 'afterTimeInterval', 'resumeAmount': 24, 'resumeUnit': 'hours'}},
                'appendAttribution': False}},
    (1280, 300), creds=['telegram'], webhookId=nid('agent/review'),
    notes='Supervisión humana: la ejecución se detiene hasta que alguien pulsa Aprobar o Rechazar (máx. 24 h).', notesInFlow=True)
if_node(a, '¿Aprobada?', [cond('={{ $json.data.approved }}', 'boolean', 'true')], (1520, 300))
P_ID = "$('Guardar propuesta').item.json"
rpc(a, 'Registrar aprobación', 'erp_review_decision',
    "{ p_id: " + P_ID + ", p_approved: true, p_reviewer: 'revisor (Telegram)', p_note: null }", (1760, 200))
rpc(a, 'Registrar rechazo', 'erp_review_decision',
    "{ p_id: " + P_ID + ", p_approved: false, p_reviewer: 'revisor (Telegram)', p_note: $json.data.approved === false ? 'Rechazada en Telegram' : 'Sin respuesta en 24 h' }",
    (1760, 420))
if_node(a, '¿Cliente con Telegram?', [cond('={{ $json.customer_message }}', 'string', 'notEmpty'),
                                     cond('={{ $json.chat_id }}', 'string', 'notEmpty')], (2000, 200))
a.add('Telegram · respuesta al cliente', 'n8n-nodes-base.telegram', 1.2, {
    'chatId': '={{ $json.chat_id }}',
    'text': "=📦 <b>Entrelibros · incidencia {{ $json.ticket_ref }}</b>\n\n{{ $json.customer_message" + ESC + " }}",
    'additionalFields': {'appendAttribution': False, 'parse_mode': 'HTML'}},
    (2240, 120), creds=['telegram'], onError='continueErrorOutput', webhookId=nid('agent/customer'))
rpc(a, 'Marcar enviada', 'erp_mark_delivered', "{ p_id: " + P_ID + ", p_simulated: false }", (2480, 100))
rpc(a, 'Marcar como simulada', 'erp_mark_delivered', "{ p_id: " + P_ID + ", p_simulated: true }", (2240, 300),
    notes='Sin chat vinculado: queda aprobada y se enviará cuando el cliente vincule Telegram.')
rpc(a, 'Log · revisión', 'erp_log', log_body('agente-soporte', 'revision_humana',
    "event_id: " + D + ".event_id, entity_type: 'ticket', entity_ref: " + D + ".ticket_ref, status: 'ok', "
    "message: 'Propuesta #' + " + P_ID + " + ': ' + ($('¿Aprobada?').isExecuted && $('Registrar aprobación').isExecuted ? 'aprobada' : 'rechazada'), "
    "details: { decision_id: " + P_ID + " }"), (2720, 300), on_error='continueRegularOutput')
rpc(a, 'Log · error del agente', 'erp_log', log_body('agente-soporte', 'propuesta',
    "event_id: $('Desde el flujo principal').item.json.event?.event_id, entity_type: 'ticket', "
    "entity_ref: $('Desde el flujo principal').item.json.ticket.ticket_number, status: 'error', error_type: 'agente', "
    "message: String($json.error?.message ?? $json.error ?? 'Fallo del agente').slice(0, 500)"), (560, 520), on_error='continueRegularOutput')
telegram(a, 'Telegram · revisión manual', OPS,
         "=⚠️ <b>El agente no ha podido analizar {{ $('Desde el flujo principal').item.json.ticket.ticket_number }}</b>\n"
         "La incidencia está en el CRM: revísala a mano en el back-office.", (800, 520))
rpc(a, 'Log · fallo al enviar', 'erp_log', log_body('agente-soporte', 'envio_cliente',
    "entity_type: 'ticket', entity_ref: " + D + ".ticket_ref, status: 'error', error_type: 'tecnico', "
    "message: 'Telegram no ha entregado la respuesta: ' + String($json.error?.message ?? '').slice(0, 300)"), (2480, 240), on_error='continueRegularOutput')

a.chain('Desde el flujo principal', 'Agente de soporte')
a.link('Agente de soporte', 'Comprobar salida del agente', 0)
a.link('Agente de soporte', 'Log · error del agente', 1)
a.chain('Log · error del agente', 'Telegram · revisión manual')
a.chain('Comprobar salida del agente', 'Guardar propuesta', 'Log · propuesta', 'Revisión humana (Telegram)', '¿Aprobada?')
a.link('¿Aprobada?', 'Registrar aprobación', 0)
a.link('¿Aprobada?', 'Registrar rechazo', 1)
a.link('Registrar aprobación', '¿Cliente con Telegram?')
a.link('¿Cliente con Telegram?', 'Telegram · respuesta al cliente', 0)
a.link('¿Cliente con Telegram?', 'Marcar como simulada', 1)
a.link('Telegram · respuesta al cliente', 'Marcar enviada', 0)
a.link('Telegram · respuesta al cliente', 'Log · fallo al enviar', 1)
a.link('Marcar enviada', 'Log · revisión')
a.link('Marcar como simulada', 'Log · revisión')
a.link('Registrar rechazo', 'Log · revisión')
a.save('2-agente-soporte.json', 'Agente de IA (Gemini) con herramientas de consulta y una acción reversible. Propone '
       'clasificación, prioridad y respuesta; una persona aprueba o rechaza en Telegram antes de contactar al cliente.')

# ======================================================================================
# 3. Bot de Telegram (canal del cliente)
# ======================================================================================
b = WF('bot', 'Entrelibros · Bot de Telegram (clientes)')
b.add('Telegram · mensaje recibido', 'n8n-nodes-base.telegramTrigger', 1.2, {'updates': ['message'], 'additionalFields': {}},
      (0, 300), creds=['telegram'], webhookId=nid('bot/trigger'))
code(b, 'Interpretar mensaje', r"""const msg = $json.message ?? {};
const text = String(msg.text ?? '').trim();
const chat_id = String(msg.chat?.id ?? '');
const username = msg.from?.username ?? null;
const name = msg.from?.first_name ?? '';
let kind = 'mensaje', token = null;
const start = text.match(/^\/start(?:\s+([a-f0-9]{8,40}))?$/i);
if (start) { kind = start[1] ? 'vincular' : 'bienvenida'; token = start[1] ?? null; }
else if (/^\/id\b/i.test(text)) kind = 'id';
else if (!text) kind = 'ignorar';
return [{ json: { kind, token, chat_id, username, name, text: text.slice(0, 2000) } }];""", (240, 300))
b.add('¿Qué pide?', 'n8n-nodes-base.switch', 3.2, {
    'rules': {'values': [
        {'conditions': {'options': {'caseSensitive': True, 'leftValue': '', 'typeValidation': 'strict', 'version': 2},
                        'conditions': [cond('={{ $json.kind }}', 'string', 'equals', k)], 'combinator': 'and'},
         'renameOutput': True, 'outputKey': lbl}
        for k, lbl in (('vincular', 'Vincular'), ('mensaje', 'Mensaje'), ('bienvenida', 'Bienvenida'), ('id', 'Id'))]},
    'options': {}}, (480, 300))
rpc(b, 'Vincular chat con la incidencia', 'erp_link_telegram',
    '{ p_token: $json.token, p_chat_id: $json.chat_id, p_username: $json.username }', (720, 100))
if_node(b, '¿Token válido?', [cond('={{ $json.result }}', 'string', 'equals', 'vinculado')], (960, 100))
CH = "={{ $('Interpretar mensaje').item.json.chat_id }}"
telegram(b, 'Confirmar vinculación', CH,
         "=✅ Listo, {{ $('Interpretar mensaje').item.json.name" + ESC + " }}. Te avisaremos aquí de la incidencia <b>{{ $('Vincular chat con la incidencia').item.json.ticket_ref }}</b>.\n"
         "Puedes escribirnos por este chat y lo añadiremos a tu incidencia.\n\n<i>Entrelibros es un prototipo académico (UCAM).</i>", (1200, 40))
telegram(b, 'Enlace no válido', CH, '=El enlace no es válido o ha caducado. Vuelve a abrirlo desde la página de soporte de Entrelibros.', (1200, 200))
code(b, 'Respuestas pendientes', r"""// Respuestas ya aprobadas por una persona que esperaban a que el cliente vinculara Telegram
const r = $('Vincular chat con la incidencia').item.json;
return (r.pending ?? []).map(p => ({ json: { ...p, ticket_ref: r.ticket_ref, chat_id: $('Interpretar mensaje').item.json.chat_id } }));""",
     (1440, 40))
b.add('Enviar pendiente', 'n8n-nodes-base.telegram', 1.2, {
    'chatId': '={{ $json.chat_id }}', 'text': "=📦 <b>Entrelibros · incidencia {{ $json.ticket_ref }}</b>\n\n{{ $json.customer_message" + ESC + " }}",
    'additionalFields': {'appendAttribution': False, 'parse_mode': 'HTML'}}, (1680, 40), creds=['telegram'],
    onError='continueRegularOutput', webhookId=nid('bot/pending'))
rpc(b, 'Marcar pendiente enviada', 'erp_mark_delivered', "{ p_id: $('Respuestas pendientes').item.json.decision_id, p_simulated: false }", (1920, 40))
rpc(b, 'Mensaje al CRM', 'erp_customer_message', '{ p_chat_id: $json.chat_id, p_text: $json.text }', (720, 300))
if_node(b, '¿Tiene incidencia?', [cond('={{ $json.result }}', 'string', 'equals', 'registrado')], (960, 300))
telegram(b, 'Acuse de recibo', CH, "=Recibido 👍 Lo hemos añadido a tu incidencia <b>{{ $json.ticket_ref }}</b>. Una persona del equipo lo revisará.", (1200, 280))
telegram(b, 'Aviso a operaciones', OPS,
         "=💬 <b>Mensaje del cliente</b> · {{ $('Mensaje al CRM').item.json.ticket_ref }}\n{{ $('Interpretar mensaje').item.json.text" + ESC + " }}", (1440, 280))
telegram(b, 'Sin incidencia', CH, '=No tienes ninguna incidencia vinculada a este chat. Ábrela desde la página de soporte de Entrelibros y pulsa «Seguir la incidencia en Telegram».', (1200, 440))
telegram(b, 'Bienvenida', CH, '=Hola 👋 Soy el bot de soporte de <b>Entrelibros</b> (prototipo académico de la UCAM).\nPara seguir una incidencia, ábrela desde la web y pulsa «Seguir la incidencia en Telegram».', (720, 520))
telegram(b, 'Responder con el id', CH, "=Tu chat id es <code>{{ $json.chat_id }}</code> (para configurar ENTRELIBROS_OPS_CHAT_ID).", (720, 680))
rpc(b, 'Log · bot', 'erp_log', log_body('bot-telegram', 'mensaje',
    "entity_type: 'ticket', entity_ref: $json.ticket_ref ?? null, status: $json.result === 'token_no_valido' || $json.result === 'sin_incidencia' ? 'ignorado' : 'ok', "
    "message: 'Telegram: ' + $('Interpretar mensaje').item.json.kind + ' → ' + $json.result"), (1200, 600), on_error='continueRegularOutput')

b.chain('Telegram · mensaje recibido', 'Interpretar mensaje', '¿Qué pide?')
b.link('¿Qué pide?', 'Vincular chat con la incidencia', 0)
b.link('¿Qué pide?', 'Mensaje al CRM', 1)
b.link('¿Qué pide?', 'Bienvenida', 2)
b.link('¿Qué pide?', 'Responder con el id', 3)
b.link('Vincular chat con la incidencia', '¿Token válido?')
b.link('Vincular chat con la incidencia', 'Log · bot')
b.link('¿Token válido?', 'Confirmar vinculación', 0)
b.link('¿Token válido?', 'Enlace no válido', 1)
b.chain('Confirmar vinculación', 'Respuestas pendientes', 'Enviar pendiente', 'Marcar pendiente enviada')
b.link('Mensaje al CRM', '¿Tiene incidencia?')
b.link('Mensaje al CRM', 'Log · bot')
b.link('¿Tiene incidencia?', 'Acuse de recibo', 0)
b.link('¿Tiene incidencia?', 'Sin incidencia', 1)
b.link('Acuse de recibo', 'Aviso a operaciones')
b.save('3-bot-telegram.json', 'Bot de Telegram del cliente: vincula el chat con la incidencia (/start <token>), entrega las '
       'respuestas aprobadas pendientes y registra en el CRM los mensajes del cliente.')
