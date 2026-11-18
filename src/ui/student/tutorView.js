/**
 * 学生端 · 引导式答疑（苏格拉底引擎交互界面）
 * 左侧：自由提问 + 题库选择；右侧：对话流。结束引导后写入答题记录并安排复习。
 */
import { h } from '../../utils/helpers.js';
import { QUESTIONS } from '../../data/questionBank.js';
import { SUBJECTS, KP_MAP } from '../../data/knowledgeMap.js';
import { store } from '../../store/storage.js';
import { createSession, createFreeSession, respond } from '../../engine/socraticEngine.js';
import { scheduleFirstReview } from '../../engine/reviewScheduler.js';

let activeSession = null;
let activeQuestionId = null;

export function renderTutor() {
  const state = store.getState();

  const freeBox = h('div.free-ask', {},
    h('textarea.free-input', { id: 'freeInput', rows: 2, placeholder: '自由提问，例如：为什么刹车时人会向前倾？' }),
    h('button.primary-btn', {
      onClick: () => {
        const txt = document.getElementById('freeInput').value.trim();
        if (!txt) return;
        activeSession = createFreeSession(txt);
        activeQuestionId = null;
        rerenderTutor();
      }
    }, '向思齐提问')
  );

  const groups = SUBJECTS.map(sub => {
    const qs = QUESTIONS.filter(q => KP_MAP[q.kpId].subject === sub);
    return h('div.q-group', {},
      h('div.q-group-title', {}, sub),
      ...qs.map(q => h('button.q-pick' + (activeQuestionId === q.id ? '.active' : ''), {
        onClick: () => openQuestion(q.id)
      },
        h('span.q-type-tag', {}, q.qType),
        h('span.q-stem', { title: q.stem }, q.stem)
      ))
    );
  });

  const left = h('div.tutor-left', {}, freeBox, h('div.q-list', {}, ...groups));
  const chat = h('div.chat-panel', { id: 'chatPanel' });
  const right = h('div.tutor-right', {}, chat);

  const view = h('div.tutor-view', {}, left, right);
  // 路由挂载后（元素已在文档中）恢复对话绘制
  if (activeSession) requestAnimationFrame(() => paintChat());
  return view;
}

/** 先把视图挂到文档，再绘制对话（保证 getElementById 能找到节点） */
function rerenderTutor() {
  const root = document.getElementById('view-root');
  if (!root) return;
  root.innerHTML = '';
  root.append(renderTutor());
  if (activeSession) paintChat();
}

function openQuestion(questionId, silent) {
  activeQuestionId = questionId;
  const saved = store.getState().socratic[questionId];
  activeSession = saved && (saved.solved || saved.revealed)
    ? saved
    : saved || createSession(questionId);
  if (!silent && !store.getState().socratic[questionId]) store.saveSocratic(questionId, activeSession);
  rerenderTutor();
}

function paintChat() {
  const panel = document.getElementById('chatPanel');
  if (!panel) return;
  panel.innerHTML = '';
  const bubbles = activeSession.history.map(m =>
    h('div.bubble-row.' + m.role, {},
      h('div.bubble-avatar', {}, m.role === 'sage' ? '思' : '我'),
      h('div.bubble' + (m.kind ? '.b-' + m.kind : ''), { html: formatBody(m.text) })
    )
  );
  const stream = h('div.chat-stream', { id: 'chatStream' }, ...bubbles);

  const input = h('textarea.chat-input', { id: 'chatInput', rows: 2, placeholder: '写下你的思路或答案；卡住可以说“提示”……' });
  const send = () => doSend();
  const bar = h('div.chat-bar', {},
    h('button.ghost-btn', {
      onClick: () => {
        const ev = { target: null };
        document.getElementById('chatInput').value = '请给出完整解答';
        doSend();
      }
    }, '查看完整解答'),
    input,
    h('button.primary-btn', { onClick: send }, '发送')
  );
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  });

  panel.append(stream, bar);
  requestAnimationFrame(() => { stream.scrollTop = stream.scrollHeight; input.focus(); });
}

async function doSend() {
  const inputEl = document.getElementById('chatInput');
  const text = inputEl.value.trim();
  if (!text || !activeSession) return;
  inputEl.value = '';
  const outcome = respond(activeSession, text);
  activeSession = outcome.session;

  if (activeSession.mode === 'bank') store.saveSocratic(activeQuestionId, activeSession);
  paintChat();

  if (outcome.finished && !activeSession._recorded && activeSession.mode === 'bank') {
    finalizeSession(outcome);
  }
}

function finalizeSession(outcome) {
  const q = QUESTIONS.find(x => x.id === activeQuestionId);
  const rid = 'r_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const correct = !!activeSession.solved;
  const record = {
    rid,
    questionId: q.id,
    kpId: q.kpId,
    correct,
    independent: !!outcome.independent,
    attempts: activeSession.wrongAttempts + 1,
    usedHints: activeSession.hintLevel,
    cause: null, // 引导模式下交由学生在错题本自我归因
    time: Date.now()
  };
  activeSession._recorded = true;
  store.addRecord(record);
  store.saveSocratic(activeQuestionId, activeSession);

  if (correct) {
    const exists = store.getState().reviews.some(r => r.kpId === q.kpId);
    if (!exists) store.upsertReview(scheduleFirstReview(q.kpId));
  }
}

function formatBody(text) {
  return String(text).replace(/\n/g, '<br>');
}
