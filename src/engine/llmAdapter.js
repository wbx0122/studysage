/**
 * AI 接口适配层（关键解耦设计）
 * ─────────────────────────────────────────────
 * 应用内所有“智能”能力都通过 complete(task, input) 调用：
 *  - mode = 'local'（默认）：走本地规则/模拟推理引擎，完全离线、无需 API Key；
 *  - mode = 'remote'：按 OpenAI Chat Completions 协议调用真实大模型，
 *    只需在设置里配置 baseURL / apiKey / model，无需改动业务代码。
 * 各引擎通过 registerLocalHandler 注册本地实现，同时提供 prompt 构建器供远程模式使用。
 *
 * 增强能力：
 *  - testConnection()：一键测试远程 API 连通性，返回详细诊断信息；
 *  - completeJSON()：要求大模型返回结构化 JSON 并自动解析（用于知识搜索等场景）；
 *  - 超时控制与友好错误信息（网络错误 / 鉴权失败 / 额度不足等分类提示）。
 */
const CONFIG_KEY = 'studysage_llm_config';

const DEFAULT_CONFIG = {
  mode: 'local',
  baseURL: 'https://modelservice.jdcloud.com/coding/openai',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.4,
  timeout: 30000
};

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

let config = loadConfig();
const localHandlers = new Map();
const promptBuilders = new Map();
let serverProxy = null;   // null=未检测, true=服务端代理可用, false=不可用（file:// 直连）
let syncTimer = null;     // 服务端配置同步防抖

/** 规范化端点：兼容用户填入带或不带 /chat/completions 的 baseURL */
function endpointURL(base) {
  let url = String(base || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (!/\/chat\/completions$/.test(url)) url += '/chat/completions';
  return url;
}

/** 将 HTTP 错误翻译为可读提示 */
function humanizeError(err, resp) {
  if (err?.name === 'AbortError') return '请求超时，请检查网络或增大超时时间。';
  if (err?.message?.includes('Failed to fetch') || err?.message?.includes('NetworkError')) {
    return '网络连接失败：请检查 Base URL 是否正确、本机能否访问该地址（跨域时需服务端放行 CORS）。';
  }
  if (resp) {
    const s = resp.status;
    if (s === 401 || s === 403) return `鉴权失败（${s}）：API Key 无效或无权限，请检查 Key 是否正确。`;
    if (s === 404) return `接口不存在（404）：Base URL 可能填错，当前请求地址为 ${endpointURL(config.baseURL)}。`;
    if (s === 429) return '请求过于频繁或额度不足（429）：请稍后重试或检查账户余额。';
    if (s >= 500) return `服务端错误（${s}）：远端模型服务暂不可用，请稍后重试。`;
    return `请求失败（${s}）：${err?.message || '未知错误'}`;
  }
  return err?.message || '未知错误';
}

function withTimeout(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || config.timeout || 30000);
  return { signal: ctrl.signal, cancel: () => clearTimeout(timer) };
}

export const llmAdapter = {
  get config() {
    return config;
  },

  configure(patch) {
    config = { ...config, ...patch };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    // 同步到服务端（防抖 800ms），局域网内其他电脑共享同一份配置
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      fetch('/api/llm-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      }).catch(() => { /* 无服务端时静默忽略 */ });
    }, 800);
    return config;
  },

  /**
   * 启动时从服务端同步配置（通过服务器访问时自动启用代理模式）。
   * 服务端配置优先：局域网内所有电脑共享同一份 API 配置与 Key。
   */
  async initFromServer() {
    try {
      const resp = await fetch('/api/llm-config');
      if (!resp.ok) { serverProxy = false; return; }
      const sc = await resp.json();
      serverProxy = true;
      // 服务端配置覆盖本地（apiKey 保留本地值作为直连兜底）
      const localKey = config.apiKey;
      config = { ...config, ...sc };
      if (!config.apiKey && localKey) config.apiKey = localKey;
    } catch {
      serverProxy = false; // file:// 直开或无服务端
    }
  },

  /** 注册本地规则实现与对应的远程 prompt 构建器 */
  registerLocalHandler(task, handler, promptBuilder) {
    localHandlers.set(task, handler);
    if (promptBuilder) promptBuilders.set(task, promptBuilder);
  },

  /** 统一入口：task 标识能力，input 为结构化输入 */
  async complete(task, input) {
    if (config.mode === 'remote') return this.remoteComplete(task, input);
    const handler = localHandlers.get(task);
    if (!handler) throw new Error(`[llm] 本地未注册能力：${task}`);
    // 模拟推理延迟，让交互更真实
    await new Promise(r => setTimeout(r, 260 + Math.random() * 260));
    return handler(input);
  },

  /**
   * 结构化输出：要求大模型返回 JSON 并自动解析。
   * options.fallback：远程不可用或解析失败时的本地兜底函数。
   */
  async completeJSON(task, input, options = {}) {
    if (config.mode !== 'remote') {
      const handler = localHandlers.get(task);
      if (!handler) throw new Error(`[llm] 本地未注册能力：${task}`);
      await new Promise(r => setTimeout(r, 260 + Math.random() * 260));
      return handler(input);
    }
    // 优先尝试 json_object 格式；API 不支持时降级为普通请求（prompt 已要求返回 JSON）
    for (const jsonMode of [true, false]) {
      try {
        const text = await this.remoteComplete(task, input, {
          jsonMode,
          systemOverride: options.systemOverride,
          images: options.images
        });
        return this.parseJSON(text);
      } catch (e) {
        const unsupported = /400|response_format|not support|invalid/i.test(e.message);
        if (jsonMode && unsupported) continue; // 降级重试
        if (options.fallback) return options.fallback(input, e);
        throw e;
      }
    }
    if (options.fallback) return options.fallback(input, new Error('JSON 解析失败'));
    throw new Error('远程模型未返回可解析的 JSON');
  },

  /** 宽容解析大模型返回的 JSON（剥离 markdown 代码块、截取首尾大括号） */
  parseJSON(text) {
    if (typeof text === 'object') return text;
    let t = String(text || '').trim();
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    if (!t.startsWith('{') && !t.startsWith('[')) {
      const s = t.search(/[{[]/);
      if (s > 0) t = t.slice(s);
    }
    const e = t.lastIndexOf('}');
    const e2 = t.lastIndexOf(']');
    const end = Math.max(e, e2);
    if (end > -1 && end < t.length - 1) t = t.slice(0, end + 1);
    return JSON.parse(t);
  },

  /**
   * OpenAI 兼容的远程调用
   * options.jsonMode：要求 response_format 为 json_object（部分模型支持）
   * options.systemOverride：直接指定 system prompt（跳过 promptBuilder）
   * options.images：base64/dataURL 图片数组，启用 vision 多模态输入
   */
  async remoteComplete(task, input, options = {}) {
    const build = promptBuilders.get(task);
    const system = options.systemOverride || (build ? build(input) : `你是学习辅助智能体“思齐”，请完成任务：${task}`);
    const userContent = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
    // 多模态：有图片时 user 消息采用 OpenAI vision 格式（content 为数组）
    let userMessage;
    if (options.images?.length) {
      const parts = [{ type: 'text', text: userContent }];
      for (const img of options.images) {
        parts.push({
          type: 'image_url',
          image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}` }
        });
      }
      userMessage = { role: 'user', content: parts };
    } else {
      userMessage = { role: 'user', content: userContent };
    }
    const messages = [
      { role: 'system', content: system },
      userMessage
    ];

    // 服务端代理模式：通过本机服务器转发（API Key 留在服务端，无跨域问题）
    if (serverProxy) {
      const { signal, cancel } = withTimeout();
      let resp;
      try {
        resp = await fetch('/api/llm-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            model: config.model,
            temperature: config.temperature,
            messages,
            jsonMode: options.jsonMode
          })
        });
      } catch (e) {
        throw new Error(humanizeError(e));
      } finally {
        cancel();
      }
      if (!resp.ok) {
        let detail = '';
        try { detail = (await resp.text()).slice(0, 300); } catch { /* ignore */ }
        throw new Error(`${humanizeError(null, resp)}${detail ? `\n服务端返回：${detail}` : ''}`);
      }
      const data = await resp.json();
      return data.choices?.[0]?.message?.content ?? '';
    }

    // 直连模式（file:// 打开或无服务端时的兜底）
    const url = endpointURL(config.baseURL);
    if (!url) throw new Error('Base URL 为空，请先在“引擎设置”中配置远程大模型地址。');
    if (!config.apiKey) throw new Error('API Key 为空，请先在“引擎设置”中填写你的 API Key。');

    const { signal, cancel } = withTimeout();
    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        signal,
        body: JSON.stringify({
          model: config.model,
          temperature: config.temperature,
          messages,
          ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {})
        })
      });
    } catch (e) {
      throw new Error(humanizeError(e));
    } finally {
      cancel();
    }
    if (!resp.ok) {
      let detail = '';
      try { detail = (await resp.text()).slice(0, 200); } catch { /* ignore */ }
      throw new Error(`${humanizeError(null, resp)}${detail ? `\n服务端返回：${detail}` : ''}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content ?? '';
  },

  /**
   * 一键测试远程 API 连通性
   * 返回 { ok:boolean, message:string, latency?:number, model?:string }
   */
  async testConnection() {
    // 服务端代理模式：由服务端直接测试（Key 在服务端，结果更准确）
    if (serverProxy) {
      try {
        const resp = await fetch('/api/llm-test', { method: 'POST' });
        return await resp.json();
      } catch (e) {
        return { ok: false, message: `❌ ${e.message}` };
      }
    }
    const url = endpointURL(config.baseURL);
    if (!url) return { ok: false, message: '❌ Base URL 为空，请先填写 API 地址。' };
    if (!config.apiKey) return { ok: false, message: '❌ API Key 为空，请先填写你的 Key。' };

    const t0 = performance.now();
    const { signal, cancel } = withTimeout(Math.min(config.timeout || 30000, 20000));
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        signal,
        body: JSON.stringify({
          model: config.model,
          max_tokens: 16,
          messages: [{ role: 'user', content: '请回复"连接成功"四个字。' }]
        })
      });
      const latency = Math.round(performance.now() - t0);
      if (!resp.ok) return { ok: false, message: `❌ ${humanizeError(null, resp)}`, latency };
      const data = await resp.json();
      const reply = data.choices?.[0]?.message?.content || '(空响应)';
      return {
        ok: true,
        latency,
        model: data.model || config.model,
        message: `✅ 连接成功！模型 ${data.model || config.model}，耗时 ${latency}ms，回复：“${String(reply).slice(0, 40)}”`
      };
    } catch (e) {
      return { ok: false, message: `❌ ${humanizeError(e)}` };
    } finally {
      cancel();
    }
  },

  /** 当前模式是否为远程 */
  get isRemote() {
    return config.mode === 'remote';
  },

  /** 服务端代理是否可用（通过服务器访问时为 true） */
  get isServerProxy() {
    return serverProxy === true;
  }
};