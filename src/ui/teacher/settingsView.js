/**
 * 教师端 · 引擎设置
 * 展示 AI 接口适配层：默认本地规则引擎离线运行，可切换 OpenAI 兼容远程大模型。
 * 支持：连接参数配置、一键测试连通性、超时设置，配置成功后即可在「全网知识搜索」中使用。
 */
import { h } from '../../utils/helpers.js';
import { llmAdapter } from '../../engine/llmAdapter.js';

let testState = null; // { testing:boolean, result:{ok,message,...} }

export function renderSettings() {
  const cfg = llmAdapter.config;

  const modeBox = h('div.mode-box', {},
    h('button.mode-card' + (cfg.mode === 'local' ? '.active' : ''), {
      onClick: () => { llmAdapter.configure({ mode: 'local' }); rerender(); }
    },
      h('strong', {}, '🧩 本地规则引擎（默认）'),
      h('p', {}, '内置模拟推理引擎，完全离线、无需 API Key，可完整演示全部核心流程。')
    ),
    h('button.mode-card' + (cfg.mode === 'remote' ? '.active' : ''), {
      onClick: () => { llmAdapter.configure({ mode: 'remote' }); testState = null; rerender(); }
    },
      h('strong', {}, '☁️ 远程大模型（我的 API）'),
      h('p', {}, '填入你自己的 OpenAI 兼容 API 地址与 Key，即可驱动全网知识搜索与各引擎的真实推理。')
    )
  );

  const field = (label, el, hint) => h('label.field', {},
    h('span.field-label', {}, label), el,
    hint ? h('span.field-hint', {}, hint) : null
  );

  // 连接测试按钮与结果
  const testBtn = h('button.primary-btn', {
    onClick: runTest,
    disabled: testState?.testing
  }, testState?.testing ? '⏳ 测试中…' : '🔌 测试连接');

  const testResult = testState?.result
    ? h('div.test-result' + (testState.result.ok ? '.ok' : '.fail'), {},
        h('span.test-result-icon', {}, testState.result.ok ? '✅' : '❌'),
        h('span', {}, testState.result.message),
        testState.result.ok
          ? h('button.ghost-btn.sm.test-goto', {
              onClick: () => { location.hash = '#/student/search'; }
            }, '🌐 去全网搜索试试')
          : null
      )
    : null;

  const remoteForm = h('div.remote-form' + (cfg.mode === 'remote' ? '' : '.disabled'), {},
    field('Base URL',
      h('input.text-input', {
        value: cfg.baseURL,
        placeholder: 'https://your-api.example.com/v1',
        onInput: e => { llmAdapter.configure({ baseURL: e.target.value }); testState = null; }
      }),
      'OpenAI 兼容端点，填到 /chat/completions 之前即可（系统会自动补全路径）。'
    ),
    field('API Key',
      h('input.text-input', {
        type: 'password', value: cfg.apiKey, placeholder: 'sk-...（填入你自己的 Key）',
        onInput: e => { llmAdapter.configure({ apiKey: e.target.value }); testState = null; }
      }),
      llmAdapter.isServerProxy
        ? 'Key 保存在服务端（llm-config.json），局域网内所有电脑共享，无需重复填写；也不会上传到任何第三方。'
        : 'Key 仅保存在本机浏览器 localStorage，不会上传到任何第三方。'
    ),
    field('模型名称',
      h('input.text-input', {
        value: cfg.model,
        placeholder: 'gpt-4o-mini / deepseek-chat / qwen-plus …',
        onInput: e => { llmAdapter.configure({ model: e.target.value }); testState = null; }
      }),
      '填入你的 API 所支持的模型 ID。'
    ),
    h('div.field-row', {},
      field('temperature',
        h('input.text-input', {
          value: cfg.temperature, type: 'number', step: '0.1', min: '0', max: '2',
          onInput: e => llmAdapter.configure({ temperature: parseFloat(e.target.value) || 0.4 })
        }),
        '0 更严谨，1 更发散'
      ),
      field('超时（毫秒）',
        h('input.text-input', {
          value: cfg.timeout, type: 'number', step: '1000', min: '5000',
          onInput: e => llmAdapter.configure({ timeout: parseInt(e.target.value) || 30000 })
        }),
        '网络慢时可调大'
      )
    ),
    h('div.test-row', {}, testBtn),
    testResult
  );

  return h('div.settings-view', {},
    h('h3.section-title', {}, '⚙️ AI 引擎与接口配置'),
    modeBox,
    h('h3.section-title', {}, '远程大模型连接参数'),
    remoteForm,
    h('div.panel', {},
      h('h3', {}, '架构说明'),
      h('p', {}, '应用内所有智能能力都通过 llmAdapter.complete(task, input) 调用：本地模式命中已注册的规则处理器，远程模式按 OpenAI Chat Completions 统一协议请求你配置的大模型。两种模式共享同一套业务代码与数据结构。'),
      h('p', {}, '已注册能力：苏格拉底引导（socratic）、费曼复述（feynman）、学情诊断（diagnosis）、错题归因（mistake）、间隔复习（review）、全网知识搜索（search）、知识点梳理（knowledgeSort）、试卷分析（examAnalysis）。'),
      llmAdapter.isServerProxy
        ? h('p.note.ok-note', {}, '✅ 当前通过服务器访问，API 请求由服务端代理转发——无跨域限制，API Key 集中保管，局域网内其他电脑直接访问即可使用，无需重复配置。')
        : h('p.note', {}, '提示：若浏览器直连你的 API 出现跨域（CORS）错误，需在 API 服务端放行 Access-Control-Allow-Origin。通过 node server.js 启动并访问时可自动走服务端代理，无此问题。')
    )
  );
}

async function runTest() {
  testState = { testing: true };
  rerender();
  try {
    const result = await llmAdapter.testConnection();
    testState = { testing: false, result };
  } catch (e) {
    testState = { testing: false, result: { ok: false, message: `❌ 测试异常：${e.message}` } };
  }
  rerender();
}

function rerender() {
  const root = document.getElementById('view-root');
  if (!root) return;
  root.innerHTML = '';
  root.append(renderSettings());
}