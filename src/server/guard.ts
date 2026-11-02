// 공개 주소에서 누구나 우리 키로 Spark·Transcribe·SAM을 마구 부르지 못하게 하는 서버 방어: IP별 속도 제한(토큰 버킷)과 요청 크기 상한.
// 한계(그대로 밝힌다):
// - 메모리에 센다. 서버 인스턴스(서버리스 함수 인스턴스)마다 따로 세므로, 인스턴스가 여럿이면 실제 한도는 그 수만큼 늘어난다.
//   확실히 막으려면 공용 저장소(Redis 등)나 배포 플랫폼의 방화벽 속도 제한을 함께 써야 한다.
// - IP는 x-forwarded-for 첫 값을 믿는다. 배포 플랫폼(프록시)이 이 헤더를 덮어써 줄 때만 믿을 수 있다.
// 켜는 조건: production 빌드(next start, 배포)에서는 늘 켠다. 개발 서버(next dev)에서는 꺼 두고, KIBO_RATE_LIMIT=on일 때만 켠다.
// 그래서 평가 하네스를 개발 서버(3100)에 HTTP로 돌려도 걸리지 않는다. production에서는 끌 수 없다.
import { langOf, type Lang } from "@/engine/turn";

export interface Bucket {
  take(key: string, now: number): boolean;
}

// 분당 perMinute회. 처음엔 가득 차 있고, 쓴 만큼 시간 비율로 다시 찬다. 기억하는 IP 수는 maxKeys까지(오래 안 쓴 것부터 버린다)
export function tokenBucket(perMinute: number, windowMs = 60_000, maxKeys = 10_000): Bucket {
  const m = new Map<string, { tokens: number; at: number }>();
  return {
    take(key, now) {
      const b = m.get(key);
      const tokens = b ? Math.min(perMinute, b.tokens + ((now - b.at) * perMinute) / windowMs) : perMinute;
      m.delete(key);
      const ok = tokens >= 1;
      m.set(key, { tokens: ok ? tokens - 1 : tokens, at: now });
      if (m.size > maxKeys) m.delete(m.keys().next().value!);
      return ok;
    },
  };
}

// 영상 녹화·사용자 시험은 한 사람이 분당 몇 번 말하거나 찍는 정도라 이 한도에 닿지 않는다
export const RATE = { interpret: 20, transcribe: 20, guide: 6 } as const;
// wavBytes: 16kHz 모노 16비트 = 초당 32KB → 약 60초. imageChars: data URL base64 약 1.5MB. utteranceChars: 전사문
export const MAX = { wavBytes: 2_000_000, imageChars: 2_000_000, utteranceChars: 500 } as const;
export const overSize = (kind: keyof typeof MAX, n: number) => n > MAX[kind];

export type GuardKind = keyof typeof RATE;
const buckets: Record<GuardKind, Bucket> = { interpret: tokenBucket(RATE.interpret), transcribe: tokenBucket(RATE.transcribe), guide: tokenBucket(RATE.guide) };

const limitOn = () => process.env.NODE_ENV === "production" || process.env.KIBO_RATE_LIMIT === "on";
const clientKey = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
// 고정 문구 언어: 휴대폰이 주소에 붙인 언어(?lang=Vietnamese) → 브라우저 언어
const reqLang = (req: Request) => langOf(new URL(req.url).searchParams.get("lang") ?? req.headers.get("accept-language")?.split(",")[0]);

const busy: Record<Lang, string> = {
  en: "Too many requests. Please try again in a moment.",
  ko: "요청이 너무 많아요. 잠시 뒤에 다시 말해 주세요.",
  ja: "リクエストが多すぎます。少し待ってからもう一度お試しください。",
  vi: "Có quá nhiều yêu cầu. Xin hãy thử lại sau giây lát.",
  zh: "请求太多了。请稍后再试。",
  es: "Demasiadas solicitudes. Inténtelo de nuevo en un momento.",
};
const big: Record<Lang, string> = {
  en: "That is too long. Please say it more briefly or use a smaller photo.",
  ko: "너무 길어요. 더 짧게 말하거나 더 작은 사진으로 다시 해 주세요.",
  ja: "長すぎます。短くおっしゃるか、小さい写真でもう一度お試しください。",
  vi: "Quá dài. Xin hãy nói ngắn hơn hoặc dùng ảnh nhỏ hơn.",
  zh: "内容太长了。请说得短一些，或换一张更小的照片。",
  es: "Es demasiado largo. Dígalo más breve o use una foto más pequeña.",
};

// 한도를 넘었으면 429 응답, 아니면 null
export function rateLimited(kind: GuardKind, req: Request, now = Date.now()): Response | null {
  if (!limitOn() || buckets[kind].take(clientKey(req), now)) return null;
  return Response.json({ error: "rate_limited", say: busy[reqLang(req)] }, { status: 429, headers: { "Retry-After": "30" } });
}

export const tooLarge = (req: Request) => Response.json({ error: "too_large", say: big[reqLang(req)] }, { status: 413 });
