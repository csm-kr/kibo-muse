// 휴대폰이 보낸 16kHz 모노 WAV를 전사한다. 소리는 저장하지 않는다.
import { transcribe } from "@/engine/transcribe";
import { burgers, simpleItems } from "@/kiosks/fastfood/menu";

const keywords = [...burgers, ...simpleItems].flatMap((i) => [i.name.en, i.name.ko]);

export async function POST(req: Request) {
  const lang = new URL(req.url).searchParams.get("lang") ?? "English";
  const wav = new Uint8Array(await req.arrayBuffer());
  if (wav.length < 44) return Response.json({ error: "WAV body is required" }, { status: 400 });
  try {
    const r = await transcribe(wav, { languageBias: [...new Set([lang, "English", "Korean"])], keywords });
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
