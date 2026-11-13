---
id: iris:ltqwdrg0
type: project
code: P08
status_scheme: task5
lifecycle: active
tags:
- {kind: 소프트웨어/산출물 종류, value: Web}
created: '2026-11-06'
---
# P08-아이리스 허브(IRIS Hub) 〖Web〗

아이리스 제품들이 함께 쓰는 공용 서버(우체국) — 지금은 메신저의 계정·친구 관계·종단간 암호문 중계와 의견함을 맡고, 앞으로 기기 등록·팀 구성원·푸시 전달을 더한다. 작업 내용은 받지 않는다. **IRIS 공용 DB(Supabase `bgintjgktcajltvmtpia`)의 표·RLS 정의와 운영 절차의 정본이 이 폴더다**(2026-11-13 메신저 P03 `hub\server\`에서 옮겨 옴 — 그 전 이력은 메신저 저장소 커밋 기록).

- 구조: `server\`(`migrations\` 표·RLS·함수 · `deploy.mjs` 배포 · `ops\` 한도 점검·의견 읽기 · `운영.md` · `처리방침.md` 정본 · 셋업 `README.md` · `hub-ref.json`) · `scripts\`(`verify-rls.mjs` 실제 허브 검사 · `sql.mjs` · `lib\admin.mjs`) · `hub.json`(클라이언트가 붙을 주소·anon 열쇠의 정본) · `test\`(네트워크 없는 구조 시험) · `.github\`(keepalive).
- 검사 두 가지: `npm test`(구조) · `npm run verify:rls`(RLS·속도 제한·Storage·연락처·의견함 정책을 실제 허브에 대고 확인 — 살아 있는 허브와 운영자 열쇠가 필요하며 코드만 읽어서는 대체할 수 없다). 정책·함수를 바꾸면 `verify:rls`를 다시 통과시키고, 메신저(P03)의 `npm test`·`npm run verify:e2e`도 다시 돌린다(메신저 무회귀).
- 쓰는 쪽(함수 인자·값 목록을 바꾸면 같은 턴에 함께 고침): 메신저 P03 `hub\client\`(연결 라이브러리 — 모듈 zip에 실려 나가므로 메신저 저장소에 둔다) · 홈페이지 P07 `site\feedback.js` · 창 P01 `daemon\feedback.mjs`.
- `hub.json`을 바꾸는 것은 `npm run deploy:hub`뿐이다. 이 명령이 옆 폴더의 메신저 저장소 `module\hub.json`도 같은 내용으로 맞춘다(폴더 번호가 아니라 패키지 이름 `iris-messenger`로 찾는다 — 후보가 둘 이상이면 아무것도 쓰지 않고 멈추며 `--messenger <폴더>`로 정해 준다. 두 파일이 같은지는 `npm test`가 본다).
- **푸시 순서(무회귀):** 이 저장소를 GitHub에 먼저 만들고 올린 **뒤에** 메신저 저장소를 푸시한다 — 메신저 README·처리방침 안내 한 장이 이 저장소를 링크하므로, 순서가 바뀌면 그 사이 링크가 끊긴다.
- keepalive(무료 Supabase 7일 정지 방지)는 이 저장소와 메신저 저장소 양쪽에 있다. 이 저장소가 GitHub에 올라가 첫 실행이 확인되기 전에는 메신저 쪽을 지우지 않는다.
- 공개: MIT, 공개 저장소 이름 `d09-p08-iris-hub`(2026-11-13 현재 로컬 저장소만 — 만들기·첫 푸시는 다음 최신판 작업 때). `service role key`는 어디에도 넣지 않는다.
- 구상 정본 = D09 `확장계획-아이리스(IRIS Expansion Plan)-2026-11-06.md` 5절(통합 허브). 메신저 설계 조각 2·9(허브·운영)의 원문은 P03 `docs\설계.md`.

<!-- 상위(루트/R07/D09) AGENTS.md 규칙 재서술 금지 -->
