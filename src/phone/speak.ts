// 휴대폰에서 글을 사용자의 언어로 읽어 준다(브라우저 TTS). 앞의 읽기는 끊는다
export function speak(text: string, lang: string) {
  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  window.speechSynthesis.speak(u);
}
