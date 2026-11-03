// 녹음본(webm·mp4 등)을 풀어 모노 WAV로 다시 표본화한다. 휴대폰 화면과 받아쓰기 측정 화면이 같이 쓴다
import { encodeWav } from "@/engine/wav";

// 휴대폰이 받아쓰기로 보내는 표본화율
export const PHONE_WAV_RATE = 16000;

export async function decodeBlob(blob: Blob) {
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    await ctx.close();
  }
}

export async function wavAt(decoded: AudioBuffer, rate: number) {
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  return encodeWav((await off.startRendering()).getChannelData(0), rate);
}
