// AIT showFullScreenAd 1회 결산. 광고 한 번당 onComplete/onFail 중 하나만 최대 1회.
// 보상형: userEarnedReward가 dismissed 앞·뒤 어디에 와도 지급 (SDK 문서: 보상은 userEarnedReward 시점에만).
// 전면형: userEarnedReward가 오지 않으므로 dismissed에서 완료.
export function adSettler(rewarded: boolean, onComplete: () => void, onFail: () => void, onClosed: () => void) {
  let done = false;
  return (type: string) => {
    if (type === 'dismissed') onClosed();
    if (done) return;
    if (type === (rewarded ? 'userEarnedReward' : 'dismissed')) { done = true; onComplete(); }
    else if (type === 'failedToShow' || type === 'error') { done = true; onFail(); }
  };
}
