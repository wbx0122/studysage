/**
 * 基于遗忘曲线的间隔复习调度器
 * ─────────────────────────────────────────────
 * 痛点：考前突击、学完就忘，复习没有节奏。
 * 依据艾宾浩斯遗忘曲线，在掌握知识点后按 1→2→4→7→15→30 天间隔安排复习，
 * 复习通过则拉长间隔，失败则回到短间隔重新巩固。
 */
import { KP_MAP } from '../data/knowledgeMap.js';

const INTERVALS_DAYS = [1, 2, 4, 7, 15, 30];
const DAY_MS = 24 * 3600 * 1000;

/** 知识点刚掌握时建立复习计划（第一间隔 1 天） */
export function scheduleFirstReview(kpId, from = Date.now()) {
  return {
    kpId,
    stage: 0,
    intervalDays: INTERVALS_DAYS[0],
    lastReview: null,
    nextDue: from + INTERVALS_DAYS[0] * DAY_MS,
    history: [],
    mature: false
  };
}

/** 完成一次复习：success 决定推进或回退 */
export function completeReview(review, success, at = Date.now()) {
  const history = [...review.history, { time: at, success }];
  if (!success) {
    return {
      ...review,
      stage: 0,
      intervalDays: INTERVALS_DAYS[0],
      lastReview: at,
      nextDue: at + INTERVALS_DAYS[0] * DAY_MS,
      history,
      mature: false
    };
  }
  const nextStage = review.stage + 1;
  if (nextStage >= INTERVALS_DAYS.length) {
    return { ...review, stage: nextStage, lastReview: at, nextDue: null, history, mature: true };
  }
  return {
    ...review,
    stage: nextStage,
    intervalDays: INTERVALS_DAYS[nextStage],
    lastReview: at,
    nextDue: at + INTERVALS_DAYS[nextStage] * DAY_MS,
    history,
    mature: false
  };
}

/** 已到期需复习的条目 */
export function getDueReviews(reviews, now = Date.now()) {
  return reviews.filter(r => !r.mature && r.nextDue != null && r.nextDue <= now);
}

/** 未来的复习安排（按到期时间排序） */
export function getUpcoming(reviews, now = Date.now()) {
  return reviews
    .filter(r => !r.mature && r.nextDue != null && r.nextDue > now)
    .sort((a, b) => a.nextDue - b.nextDue);
}

/** 演示辅助：把所有未到期复习提前到当前时刻（模拟时间流逝，离线演示用） */
export function forceDueForDemo(reviews, now = Date.now()) {
  return reviews.map(r => (r.mature ? r : { ...r, nextDue: now }));
}

/** 复习健康度概览 */
export function reviewOverview(reviews, now = Date.now()) {
  const due = getDueReviews(reviews, now).length;
  const mature = reviews.filter(r => r.mature).length;
  const upcoming = getUpcoming(reviews, now).length;
  return { total: reviews.length, due, mature, upcoming };
}

export function kpReviewName(kpId) {
  return KP_MAP[kpId]?.name || kpId;
}
