// 휴대폰이 보낸 16kHz 모노 WAV를 전사한다. 소리는 저장하지 않는다.
import { transcribe } from "@/engine/transcribe";
import { keywordsFor } from "@/kiosks/keywords";
import { overSize, rateLimited, tooLarge } from "@/server/guard";

export async function POST(req: Request) {
  // 약 60초(2MB)를 넘는 소리는 읽기 전에 거절한다(헤더가 없거나 거짓이면 읽은 뒤 다시 잰다)
  if (overSize("wavBytes", Number(req.headers.get("content-length") ?? 0))) return tooLarge(req);
  const limited = rateLimited("transcribe", req);
  if (limited) return limited;
  const params = new URL(req.url).searchParams;
  const lang = params.get("lang") ?? "English";
  // 어느 키오스크 앞인지(kiosk=airport). 그 화면의 고유 이름을 keywords로 넘긴다
  const keywords = keywordsFor(params.get("kiosk"));
  const wav = new Uint8Array(await req.arrayBuffer());
  if (wav.length < 44) return Response.json({ error: "WAV body is required" }, { status: 400 });
  if (overSize("wavBytes", wav.length)) return tooLarge(req);
  try {
    const r = await transcribe(wav, { languageBias: [...new Set([lang, "English", "Korean"])], keywords });
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
