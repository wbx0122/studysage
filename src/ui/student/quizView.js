/**
 * 学生端 · 答题 / 自测
 * 按学科/知识点筛选，逐题作答即时反馈；错题自动归因，无法判定时学生自我归因。
 */
import { h, matchAnswer } from '../../utils/helpers.js';
import { QUESTIONS, ERROR_CAUSES } from '../../data/questionBank.js';
import { KNOWLEDGE_POINTS, SUBJECTS, KP_MAP } from '../../data/knowledgeMap.js';
import { store } from '../../store/storage.js';
import { inferCause } from '../../engine/mistakeEngine.js';
import { scheduleFirstReview } from '../../engine/reviewScheduler.js';

let filterSubject = '全部';
let index = 0;
let responses = {}; // questionId -> {correct, cause, payload, recorded}

export function renderQuiz() {
  const pool = QUESTIONS.filter(q =>
    filterSubject === '全部' ? true : KP_MAP[q.kpId].subject === filterSubject
  );
  if (index >= pool.length) index = Math.max(0, pool.length - 1);

  const chips = ['全部', ...SUBJECTS].map(s =>
    h('button.chip' + (filterSubject === s ? '.active' : ''), {
      onClick: () => { filterSubject = s; index = 0; rerender(); }
    }, s)
  );

  const filterBar = h('div.filter-bar', {}, ...chips);

  if (!pool.length) return h('div.quiz-view', {}, filterBar, h('p.empty', '该学科暂无题目'));

  const q = pool[index];
  const resp = responses[q.id];
  const total = pool.length;

  const progress = h('div.quiz-progress', {},
    h('span', {}, `第 ${index + 1} / ${total} 题`),
    h('span', {}, `${KP_MAP[q.kpId].name} · ${q.qType}`)
  );

  const stem = h('div.quiz-stem', {}, q.stem);
  const answerArea = buildAnswerArea(q, resp);

  const feedback = resp ? buildFeedback(q, resp) : h('div.feedback-placeholder');

  const nav = h('div.quiz-nav', {},
    h('button.ghost-btn', { disabled: index === 0, onClick: () => { index -= 1; rerender(); } }, '上一题'),
    h('button.primary-btn', {
      disabled: index >= pool.length - 1,
      onClick: () => { index += 1; rerender(); }
    }, '下一题'),
    h('button.ghost-btn', {
      onClick: () => {
        const wrong = pool.filter(x => responses[x.id] && !responses[x.id].correct).length;
        const correct = pool.filter(x => responses[x.id]?.correct).length;
        alert(`本组共 ${pool.length} 题：答对 ${correct} 题、答错 ${wrong} 题、未答 ${pool.length - correct - wrong} 题。可到“掌握度”查看个性化路径。`);
      }
    }, '查看本组成绩')
  );

  const card = h('div.quiz-card', {}, progress, stem, answerArea, feedback, nav);
  return h('div.quiz-view', {}, filterBar, card);
}

function buildAnswerArea(q, resp) {
  const locked = !!resp;
  if (q.type === 'choice') {
    const btns = q.choices.map((c, i) => {
      let cls = 'choice-btn';
      if (locked) {
        if (i === q.answer) cls += '.correct';
        else if (resp.payload.choiceIndex === i) cls += '.wrong';
      }
      return h('button' + cls, {
        disabled: locked,
        onClick: () => submit(q, { choiceIndex: i })
      }, h('span.choice-letter', {}, String.fromCharCode(65 + i)), h('span', {}, c));
    });
    return h('div.choice-area', {}, ...btns);
  }

  const input = h('input.text-input', { id: 'quizTextInput', placeholder: '输入数值或关键词，按 Enter 提交', disabled: locked });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(q, { text: input.value }); });
  const btn = h('button.primary-btn', { disabled: locked, onClick: () => submit(q, { text: document.getElementById('quizTextInput').value }) }, '提交答案');
  return h('div.input-area', {}, input, btn);
}

function submit(q, payload) {
  if (responses[q.id]) return;
  let correct;
  if (q.type === 'choice') correct = payload.choiceIndex === q.answer;
  else correct = matchAnswer(payload.text, q.answerRules);
  const cause = correct ? null : inferCause(q, payload);
  responses[q.id] = { correct, cause, payload };
  writeRecord(q, responses[q.id]);
  rerender();
}

function buildFeedback(q, resp) {
  if (resp.correct) {
    return h('div.feedback.fb-good', {},
      h('strong', {}, '✅ 回答正确！'),
      h('p', {}, q.solution)
    );
  }
  const blocks = [
    h('div.feedback.fb-bad', {},
      h('strong', {}, '❌ 回答错误'),
      h('p', {}, `正确答案：${q.displayAnswer || q.choices[q.answer]}`),
      h('p', {}, q.solution)
    )
  ];

  if (resp.cause) {
    blocks.push(h('div.cause-box', {}, h('span', {}, '错误归因：'), h('span.cause-tag', {}, ERROR_CAUSES[resp.cause])));
  } else {
    blocks.push(h('div.cause-box', {},
      h('span', {}, '系统未识别具体原因，请自我归因：'),
      h('div.cause-btns', {}, ...Object.entries(ERROR_CAUSES).map(([k, v]) =>
        h('button' + (resp.cause === k ? '.cause-btn.active' : '.cause-btn'), {
          onClick: () => {
            responses[q.id].cause = k;
            patchRecordCause(q.id, k);
            rerender();
          }
        }, v)
      ))
    ));
  }
  return h('div', {}, ...blocks);
}

function writeRecord(q, resp) {
  const rid = 'r_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const record = {
    rid,
    questionId: q.id,
    kpId: q.kpId,
    correct: resp.correct,
    attempts: 1,
    usedHints: 0,
    cause: resp.cause,
    time: Date.now()
  };
  responses[q.id].rid = rid;
  store.addRecord(record);
  if (resp.correct) {
    const exists = store.getState().reviews.some(r => r.kpId === q.kpId);
    if (!exists) store.upsertReview(scheduleFirstReview(q.kpId));
  }
}

function patchRecordCause(questionId, cause) {
  const rid = responses[questionId].rid;
  const st = store.getState();
  const records = st.records.map(r => (r.rid === rid ? { ...r, cause } : r));
  store.update({ records });
}

function rerender() {
  const root = document.getElementById('view-root');
  if (!root) return;
  root.innerHTML = '';
  root.append(renderQuiz());
}
