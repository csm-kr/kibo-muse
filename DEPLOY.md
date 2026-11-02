# Vercel 배포 체크리스트 (시험 배포)

사용자가 배포를 승인한 뒤에만 따른다. 배포하면 누구나 열 수 있는 주소가 생긴다. 프로젝트 만들기(link), 환경 변수 올리기, 배포는 되돌리기 어렵다.

- 【확인】: 문서나 CLI help(Vercel CLI 60.0.1)로 확인한 것
- 【판단】: 근거를 두고 고른 것
- 【추론】: 문서로 확인하지 않은 것. 실행 전에 `--help`로 확인한다

**규칙**
- 배포는 늘 `vercel deploy --prod`로 한다. **미리보기 배포는 하지 않는다.** 환경 변수는 production에만 넣으므로, 미리보기 빌드에는 모델 키와 Supabase 값이 없다. 휴대폰 연결은 조용히 같은 브라우저 안 길로만 돌고, 서버는 `MODEL_API_KEY is not set` 오류를 낸다. 기본값이 미리보기인 배포 도구(예: `vercel:deploy` 스킬)는 쓰지 않는다.
- 배포하는 동안(4단계부터 6단계까지) 누구도 `src/`를 고치지 않는다.

## 0. 시작 전에

- [ ] 사용자 승인: 배포 주소 공개, **모델 키(`MODEL_API_KEY`)를 Vercel에 올린다는 것**, Vercel 프로젝트 이름, 시험 기간(닫는 날)
- [ ] Vercel 로그인은 사용자가 직접 한다: `! vercel login`
- [ ] Supabase 프로젝트는 사용자가 만들고 키를 `.env.local`에 넣는다. 우리는 만들지 않는다.
  - 테이블은 쓰지 않고 Realtime broadcast만 쓴다.
  - 공개 채널을 쓰므로 Realtime 설정에서 공개 접근이 켜져 있어야 한다【추론】.
- [ ] 로컬에서 Realtime을 먼저 확인한다. 로그는 다른 명령으로 따로 읽는다.
  ```bash
  node --env-file=.env.local --import tsx scripts/realtime-smoke.mts > <로그 폴더>/realtime-smoke.log 2>&1
  ```
  - 합격: 첫 줄이 `모드 real`, 마지막 줄이 `결과 PASS`다. `결과 PASS`는 종료 코드가 0일 때만 찍힌다.
  - 항목 다섯 개가 모두 PASS여야 한다: 접속, ① 양방향 왕복, ② self:false, ③ 15초 넘게 묵은 말 버림, ④ 다른 room 차단(같은 room에서 보낸 대조 메시지 하나는 받아야 한다).
  - 출력에는 모드, PASS/FAIL, 밀리초, 고정 문구만 나온다. 주소와 키는 나오지 않는다.
  - **`FAIL 준비: 공개용 키가 아니다`가 나오면 배포하지 않는다.** `NEXT_PUBLIC_SUPABASE_ANON_KEY` 자리에 secret 키(`sb_secret_…`)나 service_role 키가 들어간 것이다. 이 값은 공개 번들에 그대로 들어간다. 사용자가 공개용 키(`sb_publishable_…` 또는 role이 anon인 키)로 바꾼다.
- [ ] 전체 테스트, tsc, eslint가 깨끗하다: `npx vitest run`, `npx tsc --noEmit -p .`, `npx eslint .`

## 1. 올리지 않을 파일

`.gitignore`에 `.env*`가 있다. 그래도 Vercel CLI가 무엇을 올리는지는 따로 정해 둔다. 저장소 루트의 `.vercelignore`(이미 있음)【판단】:

```
.env*
!.env.example
.next
node_modules
coverage
*.tsbuildinfo
```

CLI 배포는 무시 목록에 있는 것만 빼고 작업 트리 전체를 올린다【확인】. 그래서 4단계의 릴리스 확인이 필요하다.

## 2. 프로젝트 연결

먼저 읽기 전용 명령으로 어느 계정과 팀에 붙는지 본다. 이 PC에는 이미 로그인되어 있을 수 있다.

```bash
vercel whoami
vercel teams ls
vercel project ls
```

- 같은 이름(`kibo-muse`)의 프로젝트가 이미 있으면, 연결할 때 새로 만들지 않고 그 프로젝트에 설정 그대로 붙는다. 맞는 프로젝트인지 사용자와 확인한다.

그다음 팀과 프로젝트를 명시해 연결한다【확인】:

```bash
# 저장소 루트에서
vercel link --yes --team <팀 slug> --project kibo-muse
```

- `.vercel/`이 생긴다. 이 폴더는 `.gitignore`에 들어 있다.
- 처음이면 프로젝트가 새로 만들어진다. 이 단계부터 사용자 승인이 필요하다.
- `vercel link`는 `.env.local`에 `VERCEL_OIDC_TOKEN`을 넣거나 갱신한다【확인】. 그 뒤로 `.env.local`에는 사용자가 넣지 않은 값도 있다. 이 파일은 열거나 출력하지 않는다. `.vercelignore`가 업로드에서 뺀다.

## 3. 환경 변수 (Production)

넣을 것은 세 개다.

| 이름 | 쓰는 곳 | 종류 |
|---|---|---|
| `MODEL_API_KEY` | 서버(해석·받아쓰기·안내 모드) | `--sensitive` |
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저(빌드 때 번들에 그대로 들어간다) | 일반 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 브라우저(빌드 때 번들에 그대로 들어간다. 공개용 키만 넣는다, 0단계 스모크로 확인) | 일반 |

**`KIBO_RATE_LIMIT`은 넣지 않는다.** 속도 제한은 production에서 늘 켜져 있고 끌 수 없다.

### 3-1. 존재 확인 (어느 방법이든 먼저)

이름마다 `set` 또는 `MISSING`만 로그에 찍는다. 값은 찍지 않는다.

```bash
node --env-file=.env.local -e 'for (const k of ["MODEL_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) console.log(k, process.env[k] ? "set" : "MISSING")' > <로그 폴더>/env-check.log
```

- 셋 다 `set`이어야 다음으로 간다. `MISSING`이 있으면 사용자에게 알리고 멈춘다.

### 3-2. 넣는 방법 (셋 중 하나)

- **ⓐ 기본: 사용자가 Vercel 대시보드에서 직접 넣는다.** 프로젝트 설정의 환경 변수 화면에서 Production에 세 개를 넣는다. 에이전트는 키를 만지지 않는다. (대시보드 메뉴 위치는 문서로 확인하지 않았다.)
- **ⓑ 사용자가 CLI를 직접 실행한다.** `! vercel env add MODEL_API_KEY production --sensitive`처럼 이름마다 실행하고, 입력 칸에 값을 붙여 넣는다. `!`로 실행할 때 입력이 화면에 숨겨지는지는 확인하지 못했다.
- **ⓒ 파이프 방식: 사용자가 이 방식을 따로 명시해 승인한 경우에만 쓴다.** 키를 다른 프로그램에 넘기는 방식이라 기본으로 쓰지 않는다. 3-1에서 셋 다 `set`인 것을 확인한 뒤에만 쓴다.
  ```bash
  node --env-file=.env.local -e "process.stdout.write(process.env.MODEL_API_KEY ?? '')" | vercel env add MODEL_API_KEY production --sensitive
  node --env-file=.env.local -e "process.stdout.write(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')" | vercel env add NEXT_PUBLIC_SUPABASE_URL production
  node --env-file=.env.local -e "process.stdout.write(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '')" | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
  ```

### 3-3. 넣은 뒤

```bash
vercel env list production
```

- 이름 세 개가 보이는지만 본다.
- **`--json`이나 `--format json`은 쓰지 않는다.** 읽을 수 있는 값까지 출력한다【확인】.
- `NEXT_PUBLIC_` 값은 빌드할 때 들어간다. 값을 바꾸면 다시 배포해야 한다.

## 4. 릴리스 확인 (배포 직전)

평가한 코드와 배포할 코드가 같은지 확인한다. 평가 숫자(README의 39 of 40 등)는 빌드 지문 `f4076fabbd`에서 쟀다.

```bash
# src 지문
{ git diff HEAD -- src; git ls-files --others --exclude-standard -- src | sort | while read -r f; do cat "$f"; done; } | sha1sum | cut -c1-10
# 평가 빌드의 동결 사본(critic-tech의 frozen-f4076fabbd)과 비교
diff -rq <동결 사본 폴더>/src src
```

- 다른 파일이 표시 파일뿐이어야 한다: `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/film/**`, 테스트 파일(`*.test.ts`).
- **그 밖의 파일(해석·계획·안내·서버 코드)이 다르면 배포하지 않는다.** 평가를 다시 돌리고 숫자를 다시 정한 뒤에 배포한다.
- 이 확인부터 6단계 끝까지 `src/`를 고치지 않는다.
- 지문과 배포 주소를 짝지어 기록한다. 5단계 뒤 `<로그 폴더>/release.txt`에 한 줄: `지문 <10자>  주소 <production 도메인>  시각 <배포 시각>`.

## 5. 배포

```bash
vercel deploy --prod --yes > <로그 폴더>/deploy-url.txt 2> <로그 폴더>/deploy.log
```

- `deploy-url.txt`에 찍히는 것은 **배포마다 다른 고유 주소**다【확인】. 이 주소는 배포 보호에 막힐 수 있다.
- 아래 `<주소>`에는 **production 도메인**을 쓴다. `deploy.log`의 "Aliased" 줄이나 `vercel project inspect kibo-muse`에서 읽는다.
- 빌드가 실패하면 `vercel inspect <배포 주소> --logs`로 빌드 로그를 본다.

## 6. 배포 뒤 확인

### 6-1. 첫 화면과 페이지 6개가 200

```bash
for p in "/" "/kiosk/fastfood?view=kiosk&qr=0" "/kiosk/airport?view=kiosk&qr=0" "/kiosk/train?view=kiosk&qr=0" "/compare?qr=0" "/show/airport?qr=0" "/phone"; do
  curl -s -o /dev/null -w "%{http_code} $p\n" "<주소>$p"
done
```

- **모두 401이나 302가 나오면 주소를 잘못 고른 것이다.** 배포별 고유 주소를 넣었을 가능성이 크다. 새 프로젝트는 기본으로 Standard Protection이 켜져 있다고 보고【추론】, 이 보호는 production 도메인이 아닌 주소를 막는다【확인】. 5단계에서 production 도메인을 다시 읽는다. QR은 지금 연 주소(`location.origin`)로 만들어지므로, 잘못된 주소로 열면 휴대폰이 Vercel 로그인 화면으로 간다.

### 6-2. 속도 제한 429

빈 본문 해석 요청은 Spark를 부르지 않는다(한도 검사가 먼저 돈다). 30번 보내면서 걸린 시간 T도 찍는다.

```bash
start=$(date +%s%N)
for i in $(seq 1 30); do printf "%s:%s " "$i" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{}' '<주소>/api/train/interpret')"; done
printf "\nT=%s ms\n" $(( ($(date +%s%N) - start) / 1000000 ))
```

- 한도는 분당 20개이고 3초마다 1개씩 다시 찬다(`src/server/guard.ts`). 그래서 인터넷 너머에서는 21번째가 아니라 조금 뒤에 첫 429가 나온다.
- **합격: 첫 429가 21 + ⌈T/3⌉번째 이내에 나온다**(T는 초). 예: T가 6초면 23번째 이내. 그 앞은 400이다. 429에는 고정 문구가 온다.
- 30번 안에 429가 한 번도 없으면, 인스턴스가 여러 개라 한도를 인스턴스마다 따로 센다고 본다【추론】. 실패로 보지 않고, 남은 위험으로 README에 밝힌다.
- `x-forwarded-for` 헤더를 직접 넣지 않는다. Vercel은 이 헤더를 덮어쓰므로 사용자가 위조할 수 없다【확인】.

### 6-3. 실제 휴대폰(HTTPS)

- [ ] **QR 짝짓기**
  1. PC에서 `<주소>/kiosk/fastfood?view=kiosk`를 연다(QR이 보이게 `qr=0`은 붙이지 않는다).
  2. 휴대폰 카메라로 QR을 찍는다. `<주소>/phone?room=…`(22자 room)이 열려야 한다.
  3. 휴대폰 상태가 연결됨으로 바뀌어야 한다. 연결 표시는 키오스크가 보낸 상태 메시지를 받아야만 켜진다.
- [ ] **마이크**
  1. 휴대폰에서 마이크를 누르고 권한을 허용한다.
  2. "치즈버거 세트 하나, 콜라로, 먹고 갈게요"라고 말한다.
  3. 키오스크가 움직이고, 결제 앞에서 멈추고, 휴대폰에 결제 안내가 와야 한다.
- [ ] **카메라(안내 모드) 1회**
  1. 휴대폰 안내 모드에서 카메라 권한을 허용한다.
  2. 키오스크 화면을 찍고 묻는다.
  3. 표시와 답이 와야 한다. 요청은 분당 6회까지다.
- [ ] 기차·공항도 한 문장씩 해 본다. 결제·체크인 확정·여권은 사람이 한다.

### 6-4. 비용 확인

- [ ] 모델 콘솔에서 시험 뒤 사용량을 본다.

## 7. 시험 당일 아침

- [ ] 0단계의 스모크를 다시 돌린다(약 25초, Spark 0회). 첫 줄 `모드 real`, 마지막 줄 `결과 PASS`.
- [ ] 키오스크 탭을 새로 연다. 공개 Realtime 연결은 최대 24시간까지만 유지된다【확인】.
- [ ] 6-1을 한 번 더 돌린다.

## 8. 시험이 끝나면 닫기

먼저 사용자가 고르게 한다. 1과 2는 되돌릴 수 있다.

1. **production 일시 정지** (방문자에게 오류 화면이 보인다)
   - **사용자가 직접 실행한다.** pause는 프로젝트 이름을 직접 입력해 확인해야 하고, 확인을 건너뛰는 옵션이 없다【확인】. 에이전트가 돌리면 확인을 받지 못해 실패하고 사이트는 열린 채로 남는다.
   ```bash
   ! vercel project pause kibo-muse
   # 다시 열 때
   ! vercel project resume kibo-muse
   ```
2. **배포 보호를 모든 배포에 켜기**(Vercel 로그인한 사람만 열 수 있다)
   - `vercel project protection enable kibo-muse --sso`로는 범위를 고를 수 없다【확인】. Standard Protection은 production 도메인을 막지 않는다【확인】.
   - 그래서 사용자가 대시보드에서 **"All Deployments"**를 고른다. 위치: 대시보드에서 프로젝트를 고르고 **Settings → Deployment Protection**(Vercel 문서 `https://vercel.com/docs/deployment-protection`의 "Where to find Deployment Protection settings").
   - 켠 뒤 production 도메인이 실제로 닫혔는지 본다. 200이 아니라 401이나 302가 나와야 한다:
     ```bash
     curl -s -o /dev/null -w "%{http_code}\n" "<주소>/phone"
     ```
3. **모델 키 끊기**(완전히 닫을 때, 되돌릴 수 없다)
   1. 모델 콘솔에서 **이전 키를 폐기**한다. 새 키를 발급해도 이전 키는 끊기지 않고, `vercel env rm`은 새 배포에만 반영된다. 이전 배포는 키를 그대로 갖고 있다【추론】.
   2. 필요하면 새 키를 발급한다.
   3. 다시 열 계획이 있으면 3단계 방법으로 env를 갱신하고 `--prod`로 다시 배포한다. 없으면 `vercel env rm MODEL_API_KEY production`.

프로젝트 삭제(`vercel project remove`)는 되돌릴 수 없다. 사용자가 따로 요청할 때만 한다.
