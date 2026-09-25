// node --test src/adSettle.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adSettler } from './adSettle.ts';

function run(rewarded: boolean, seq: string[]) {
  const r = { done: 0, fail: 0, closed: 0 };
  const s = adSettler(rewarded, () => r.done++, () => r.fail++, () => r.closed++);
  seq.forEach(s);
  return r;
}

test('보상형: 보상 도착 순서와 무관하게 정확히 1회', () => {
  assert.equal(run(true, ['userEarnedReward', 'dismissed']).done, 1);
  assert.equal(run(true, ['dismissed', 'userEarnedReward']).done, 1);
  assert.equal(run(true, ['userEarnedReward', 'userEarnedReward', 'dismissed']).done, 1);
});
test('보상형: 보상 없이 닫으면 미지급, 재로드는 수행', () => {
  assert.deepEqual(run(true, ['show', 'dismissed']), { done: 0, fail: 0, closed: 1 });
});
test('전면형: 닫힘에서 1회 완료', () => {
  assert.equal(run(false, ['requested', 'show', 'impression', 'dismissed']).done, 1);
});
test('표시 실패: 폴백 1회, 지급과 중복 없음', () => {
  assert.deepEqual(run(true, ['failedToShow', 'error', 'userEarnedReward']), { done: 0, fail: 1, closed: 0 });
});
