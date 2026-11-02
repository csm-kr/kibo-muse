// Realtime 스모크 준비 검사: 클라이언트를 만들기 전에 주소 형식과 키 종류만 본다.
// 공개 번들에 들어갈 자리(NEXT_PUBLIC_)에 secret·service_role 키가 들어가면 배포 전에 멈추게 한다.
// 돌려주는 문구는 고정 문구뿐이다. 키나 주소 조각은 넣지 않는다.

export function smokeConfigError(url: string | undefined, key: string | undefined): string | null {
  if (!url || !key) return "FAIL 준비: Supabase 키가 없다";
  if (!URL.canParse(url) || new URL(url).protocol !== "https:") return "FAIL 준비: 주소 형식이 맞지 않다";
  if (!isPublicKey(key)) return "FAIL 준비: 공개용 키가 아니다";
  return null;
}

// sb_publishable_ 키와 role이 anon인 JWT만 공개용이다. sb_secret_, 다른 role, 읽을 수 없는 꼴은 모두 아니다
function isPublicKey(key: string): boolean {
  if (key.startsWith("sb_publishable_")) return true;
  if (!key.startsWith("eyJ")) return false;
  try {
    return JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8")).role === "anon";
  } catch {
    return false;
  }
}
