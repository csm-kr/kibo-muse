// 휴대폰이 보낸 16kHz 모노 WAV를 전사한다. 소리는 저장하지 않는다.
import { transcribe } from "@/engine/transcribe";
import { langOf, type Lang } from "@/engine/turn";
import { keywordsFor } from "@/kiosks/keywords";
import { logError, overSize, rateLimited, tooLarge } from "@/server/guard";

// 받아쓰기가 실패했을 때 휴대폰에 보이는 고정 문구(휴대폰 언어)
const failed: Record<Lang, string> = {
  en: "I couldn't hear that. Please try again.",
  ko: "잘 듣지 못했어요. 다시 말해 주세요.",
  ja: "うまく聞き取れませんでした。もう一度お話しください。",
  vi: "Tôi chưa nghe rõ. Xin hãy nói lại.",
  zh: "没有听清楚。请再说一遍。",
  es: "No pude oírlo. Inténtelo de nuevo.",
};

export async function POST(req: Request) {
  // 약 60초(2MB)를 넘는 소리는 읽기 전에 거절한다(헤더가 없거나 거짓이면 읽은 뒤 다시 잰다)
  if (overSize("wavBytes", Number(req.headers.get("content-length") ?? 0))) return tooLarge(req, "speech");
  const limited = rateLimited("transcribe", req);
  if (limited) return limited;
  const params = new URL(req.url).searchParams;
  const lang = params.get("lang") ?? "English";
  // 어느 키오스크 앞인지(kiosk=airport). 그 화면의 고유 이름을 keywords로 넘긴다
  const keywords = keywordsFor(params.get("kiosk"));
  const wav = new Uint8Array(await req.arrayBuffer());
  if (wav.length < 44) return Response.json({ error: "bad_request" }, { status: 400 });
  if (overSize("wavBytes", wav.length)) return tooLarge(req, "speech");
  try {
    const r = await transcribe(wav, { languageBias: [...new Set([lang, "English", "Korean"])], keywords });
    return Response.json(r);
  } catch (e) {
    // 예외 원문(상류 응답 일부가 들어 있을 수 있다)은 서버 로그에만 남긴다(300자, base64 지움)
    logError("transcribe failed:", e);
    return Response.json({ error: "transcribe_failed", say: failed[langOf(lang)] }, { status: 502 });
  }
}
