import { describe, expect, it } from "vitest";
import { encodeWav } from "./wav";

describe("WAV 인코더", () => {
  it("Float32 표본을 16비트 모노 PCM WAV로 감싸고, 범위를 넘는 값은 잘라 낸다", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2]), 16000);
    const v = new DataView(wav.buffer);
    const ascii = (o: number) => String.fromCharCode(...wav.slice(o, o + 4));

    expect(ascii(0)).toBe("RIFF");
    expect(v.getUint32(4, true)).toBe(36 + 8);
    expect(ascii(8)).toBe("WAVE");
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // 모노
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint32(28, true)).toBe(32000); // 바이트/초
    expect(v.getUint16(34, true)).toBe(16);
    expect(ascii(36)).toBe("data");
    expect(v.getUint32(40, true)).toBe(8);
    expect([0, 1, 2, 3].map((i) => v.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 32767]);
  });
});
