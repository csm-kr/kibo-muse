// 서버가 그 사람의 언어(?lang=)로 만든 고정 문구(say)를 보내는 거절: 한도(429)와 너무 긴 말(413).
// say가 있으면 그것으로 거절하고, 없으면 null(일반 오류 처리)
const reasons: Record<number, string> = { 429: "rate_limited", 413: "too_large" };

export async function limitedReject(res: Response, lang: string) {
  const reason = reasons[res.status];
  if (!reason) return null;
  const body = (await res.json().catch(() => ({}))) as { say?: string };
  return body.say ? { kind: "reject" as const, reason, lang, say: body.say } : null;
}
