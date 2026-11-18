/**
 * POST /api/llm-test → 测试 LLM API 连通性
 * Cloudflare Pages Function
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  const baseURL = env.LLM_BASE_URL || '';
  const apiKey = env.LLM_API_KEY || '';
  const model = env.LLM_MODEL || 'gpt-4o-mini';

  let url = String(baseURL || '').trim().replace(/\/+$/, '');
  if (!url) return Response.json({ ok: false, message: '❌ Base URL 为空，请先配置环境变量。' });
  if (!/\/chat\/completions$/.test(url)) url += '/chat/completions';
  if (!apiKey) return Response.json({ ok: false, message: '❌ API Key 为空，请先配置环境变量。' });

  const t0 = Date.now();
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: '请回复"连接成功"四个字。' }]
      })
    });
    const latency = Date.now() - t0;
    const data = await resp.json();
    if (!resp.ok) {
      const s = resp.status;
      const hint = s === 401 || s === 403 ? 'API Key 无效或无权限' :
        s === 404 ? '接口不存在（404），请检查 Base URL' :
        s === 429 ? '请求过于频繁或额度不足' : `服务端错误（${s}）`;
      return Response.json({ ok: false, message: `❌ ${hint}`, latency });
    }
    const reply = data.choices?.[0]?.message?.content || '(空响应)';
    return Response.json({
      ok: true,
      latency,
      model: data.model || model,
      message: `✅ 连接成功！模型 ${data.model || model}，耗时 ${latency}ms，回复："${String(reply).slice(0, 40)}"`
    });
  } catch (e) {
    return Response.json({ ok: false, message: `❌ ${e.name === 'TimeoutError' ? '请求超时' : e.message}` });
  }
}