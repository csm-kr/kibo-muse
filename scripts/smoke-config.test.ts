import { describe, expect, it } from "vitest";
import { smokeConfigError } from "./smoke-config";

// 모두 가짜 값이다. JWT는 가운데 조각의 role만 바꾼다
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (role: string) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iss: "supabase", ref: "fakeref", role })}.fakesignature`;

describe("Realtime 스모크 준비 검사", () => {
  it("https 주소와 공개용 키만 통과시키고, 실패 문구는 키·주소 조각 없는 고정 문구다", () => {
    const url = "https://fake-project.supabase.co";
    expect(smokeConfigError(url, "sb_publishable_fakefakefake")).toBeNull();
    expect(smokeConfigError(url, jwt("anon"))).toBeNull();
    for (const key of ["sb_secret_fakefakefake", jwt("service_role"), jwt("authenticated"), "eyJnot-a-jwt", "fakeplainkey"]) {
      expect(smokeConfigError(url, key)).toBe("FAIL 준비: 공개용 키가 아니다");
    }
    for (const bad of ["fake-project.supabase.co", "http://fake-project.supabase.co", "https://fake project.supabase.co"]) {
      expect(smokeConfigError(bad, "sb_publishable_fakefakefake")).toBe("FAIL 준비: 주소 형식이 맞지 않다");
    }
    expect(smokeConfigError(undefined, undefined)).toBe("FAIL 준비: Supabase 키가 없다");
  });
});
