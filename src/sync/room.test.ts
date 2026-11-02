import { describe, expect, it } from "vitest";
import { newRoomCode, pairUrl } from "./room";

describe("짝짓기 room", () => {
  it("room은 추측할 수 없는 16바이트 난수(base64url 22자), 휴대폰 주소는 같은 출처의 /phone?room=", () => {
    const codes = Array.from({ length: 300 }, () => newRoomCode());
    expect(codes.every((c) => /^[A-Za-z0-9_-]{22}$/.test(c))).toBe(true);
    expect(new Set(codes).size).toBe(300);
    expect(pairUrl("http://192.168.0.7:3200", "q3Xz-9_aB0cD1eF2gH3iJ4")).toBe("http://192.168.0.7:3200/phone?room=q3Xz-9_aB0cD1eF2gH3iJ4");
  });
});
