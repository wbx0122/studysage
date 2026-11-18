/**
 * 班级 Mock 数据（教师端看板数据源）
 * 用带种子的伪随机生成，保证每次刷新图表稳定；
 * 每条记录结构与本地学生真实答题记录一致，教师端聚合时会把本地学生一并纳入。
 */
import { QUESTIONS, Q_MAP } from './questionBank.js';

const STUDENT_NAMES = [
  '王梓萱', '李浩然', '张思远', '刘一诺', '陈俊杰',
  '赵雨桐', '孙明哲', '周若琳', '吴嘉树', '郑书瑶'
];

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20261105);

// 每个学生的整体能力值（0~1），以及每个知识点的相对薄弱系数
const STUDENTS = STUDENT_NAMES.map((name, i) => {
  const ability = 0.45 + rng() * 0.4;
  const kpBias = {};
  QUESTIONS.reduce((acc, q) => {
    if (!(q.kpId in acc)) acc[q.kpId] = 0.7 + rng() * 0.6;
    return acc;
  }, kpBias);
  return { id: 'mock_' + i, name, ability, kpBias, isMock: true };
});

function pickCause(q) {
  const causes = Object.values(q.distractorCauses || {});
  if (q.commonWrong && q.commonWrong.length) {
    const pool = q.commonWrong.map(w => w.cause);
    if (rng() < 0.6 && pool.length) return pool[Math.floor(rng() * pool.length)];
  }
  if (causes.length) return causes[Math.floor(rng() * causes.length)];
  return 'concept';
}

function buildRecords() {
  const records = [];
  const now = Date.now();
  const DAY = 24 * 3600 * 1000;
  STUDENTS.forEach(stu => {
    // 每个学生不一定做完全部题，覆盖 70%~100%
    QUESTIONS.forEach(q => {
      if (rng() > 0.92) return;
      const correctProb = Math.min(0.95, stu.ability * (stu.kpBias[q.kpId] || 1));
      const correct = rng() < correctProb;
      const attempts = correct ? (rng() < 0.3 ? 2 : 1) : 1 + Math.floor(rng() * 2);
      const daysAgo = Math.floor(rng() * 14);
      records.push({
        studentId: stu.id,
        studentName: stu.name,
        questionId: q.id,
        kpId: q.kpId,
        correct,
        attempts,
        usedHints: correct ? (rng() < 0.35 ? 1 : 0) : 1 + Math.floor(rng() * 2),
        cause: correct ? null : pickCause(q),
        time: now - daysAgo * DAY - Math.floor(rng() * DAY * 0.6)
      });
    });
  });
  return records;
}

export const MOCK_STUDENTS = STUDENTS;
export const MOCK_RECORDS = buildRecords();

export function getMockStudent(id) {
  return STUDENTS.find(s => s.id === id);
}
