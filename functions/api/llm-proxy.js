/**
 * POST /api/llm-proxy → 转发大模型请求（服务端持有 apiKey）
 * Cloudflare Pages Function
 */
function endpointURL(base) {
  let url = String(base || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (!/\/chat\/completions$/.test(url)) url += '/chat/completions';
  return url;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const baseURL = env.LLM_BASE_URL || '';
    const apiKey = env.LLM_API_KEY || '';
    const model = env.LLM_MODEL || 'gpt-4o-mini';
    const temperature = parseFloat(env.LLM_TEMPERATURE) || 0.4;

    if (!baseURL) {
      return Response.json({ error: { message: 'Base URL 为空，请先配置环境变量。' } }, { status: 400 });
    }
    if (!apiKey) {
      return Response.json({ error: { message: 'API Key 为空，请先配置环境变量。' } }, { status: 400 });
    }

    const url = endpointURL(baseURL);
    const payload = {
      model: body.model || model,
      temperature: body.temperature ?? temperature,
      messages: body.messages
    };
    if (body.jsonMode) payload.response_format = { type: 'json_object' };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    return Response.json(data, { status: resp.ok ? 200 : resp.status });
  } catch (e) {
    const msg = e.name === 'AbortError' ? '请求超时' :
      /fetch|network|ENOTFOUND|ECONNREFUSED/i.test(e.message) ? `网络连接失败：${e.message}` : e.message;
    return Response.json({ error: { message: `API 代理请求失败：${msg}` } }, { status: 502 });
  }
}