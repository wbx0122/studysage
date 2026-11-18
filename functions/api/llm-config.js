/**
 * GET /api/llm-config → 返回云端配置（不含 apiKey）
 * POST /api/llm-config → 云端只读，静默成功
 * Cloudflare Pages Function
 */
function getConfig(env) {
  return {
    mode: env.LLM_MODE || 'remote',
    baseURL: env.LLM_BASE_URL || '',
    apiKey: env.LLM_API_KEY || '',
    model: env.LLM_MODEL || 'gpt-4o-mini',
    temperature: parseFloat(env.LLM_TEMPERATURE) || 0.4,
    timeout: parseInt(env.LLM_TIMEOUT) || 30000
  };
}

export async function onRequestGet(context) {
  const cfg = getConfig(context.env);
  const { apiKey, ...safe } = cfg;
  return Response.json({ ...safe, hasApiKey: !!apiKey });
}

export async function onRequestPost(context) {
  return Response.json({ ok: true });
}