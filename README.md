<!-- IRIS Hub · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home -->

# IRIS Hub

IRIS 제품들이 함께 쓰는 서버(우체국)입니다. 지금은 **IRIS 메신저**의 계정·친구 관계·암호문 중계와 **IRIS 의견함**(홈페이지·IRIS 창의 「의견 보내기」)을 맡습니다. 서버는 사용자의 작업 내용·과정·세션 기록을 받지 않으며, 메시지는 종단간 암호화(E2EE) 암호문으로만 지나갑니다.

서버는 따로 돌아가는 프로그램이 아니라 **Supabase 프로젝트 하나에 올리는 표·접근 규칙(RLS)·함수**입니다. 이 저장소에는 그 정의와 운영 도구가 들어 있습니다.

| 자리 | 내용 |
|---|---|
| `server/migrations/` | 표·접근 규칙·함수 정의(순번대로 적용) |
| `server/deploy.mjs` | 정의를 Supabase에 올리고 `hub.json`을 쓰는 배포 도구 |
| `server/ops/` | 한도 점검(`daily.mjs`) · 의견 읽기(`feedback.mjs`) |
| `server/운영.md` · `server/처리방침.md` | 운영 절차 · 개인정보 처리방침(정본) |
| `scripts/verify-rls.mjs` | 접근 규칙을 실제 허브에 대고 확인하는 검사 |
| `hub.json` | 클라이언트가 붙을 주소와 공개 열쇠(anon key — 공개해도 안전, RLS가 방어) |

## 자기 허브 세우기

공식 허브에 기대지 않고 자기 Supabase 프로젝트에 같은 서버를 세울 수 있습니다. 절차는 [`server/README.md`](server/README.md)에 있습니다.

## 검사

```
npm test             # 네트워크 없이 도는 구조 시험
npm run verify:rls   # 실제 허브에 대고 접근 규칙 확인(운영자 열쇠 필요)
```

접근 규칙이나 함수를 바꾸면 `verify:rls`를 반드시 다시 통과시킵니다.

## 이력

2026-11-13 IRIS 메신저 저장소([`d06-p04-iris-messenger`](https://github.com/Feynman520/d06-p04-iris-messenger))의 `hub/server/`에서 옮겨 왔습니다. 그 전 변경 이력은 메신저 저장소의 커밋 기록에 있습니다. 메신저 클라이언트(모듈)와 연결 라이브러리는 메신저 저장소에 그대로 있습니다.

---

**English summary.** IRIS Hub is the shared server behind IRIS Messenger and the IRIS feedback inbox: Supabase schema, row-level-security policies, and operator tooling. It never receives users' work content; messages pass only as end-to-end encrypted ciphertext. To self-host, see [`server/README.md`](server/README.md). License: MIT.

## 기여 (Contributing)

의견과 PR 안내는 [CONTRIBUTING.md](CONTRIBUTING.md)를, 보안 문제 신고는 [SECURITY.md](SECURITY.md)를 봐 주세요.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute and [SECURITY.md](SECURITY.md) for reporting security issues.
