import { describe, expect, it } from "vitest";
import { localLink, type LinkMsg } from "./link";

describe("로컬 연결", () => {
  it("같은 방의 상대에게만 메시지를 전하고, 자기 자신이나 다른 방에는 전하지 않는다", async () => {
    const phone = localLink("room-a");
    const kiosk = localLink("room-a");
    const other = localLink("room-b");
    const got: { kiosk: LinkMsg[]; phone: LinkMsg[]; other: LinkMsg[] } = { kiosk: [], phone: [], other: [] };
    kiosk.subscribe((m) => got.kiosk.push(m));
    phone.subscribe((m) => got.phone.push(m));
    other.subscribe((m) => got.other.push(m));

    phone.send({ type: "utterance", text: "치즈버거 세트", lang: "Korean" });
    await new Promise((r) => setTimeout(r, 30));

    expect(got).toEqual({ kiosk: [{ type: "utterance", text: "치즈버거 세트", lang: "Korean" }], phone: [], other: [] });
    [phone, kiosk, other].forEach((l) => l.close());
  });
});
