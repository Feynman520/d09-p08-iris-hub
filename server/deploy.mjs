// IRIS Hub · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 허브 배포(운영자 전용): 마이그레이션 SQL 적용 → Auth(OTP 6자리·10분·SMTP·메일 틀) → anon key 를 hub.json 에 기록
// (옆 폴더에 IRIS 메신저 저장소가 있으면 그 module/hub.json 도 같은 내용으로 맞춘다).
// 사용: node server/deploy.mjs [--env <secrets .env 경로>] [--messenger <메신저 저장소 폴더>] [--no-auth] [--dry]
// 이 파일은 import 만으로는 아무 일도 하지 않는다(읽기·검사·종료는 전부 main() 또는 호출 시점에).
// 2026-11-13: IRIS 메신저 저장소(d06-p04-iris-messenger)의 hub/server/ 에서 이 저장소로 옮겼다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

// 이 저장소 저자의 개인 경로(다른 운영자에게는 없다 — 없으면 저장소 루트 .env 로 내려간다).
const IRIS_ENV = path.join(process.env.CLAUDE_CONFIG_DIR || 'C:/IRIS/_agent/claude', 'secrets', '.env');
let envOverride = null; // --env 로 지정한 경로(main 에서만 설정)

export function readEnv(p) {
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) out[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
  return out;
}

// 운영자마다 비밀 파일 위치가 다르다: --env → IRIS_HUB_ENV(옛 이름 IRIS_MESSENGER_ENV 도 읽음) → 저자 기본 경로 → 저장소 루트 .env.
export function envFile(override = null) {
  const given = override || envOverride || process.env.IRIS_HUB_ENV || process.env.IRIS_MESSENGER_ENV;
  if (given) return given;
  if (fs.existsSync(IRIS_ENV)) return IRIS_ENV;
  return path.join(root, '.env');
}

/** { env, file } — 파일이 없거나 읽히지 않으면 env 는 빈 객체이고, file 로 "어디를 봤는지"를 알린다. */
export function loadEnv(override = null) {
  const file = envFile(override);
  let env = {};
  try { env = readEnv(file); } catch { env = {}; }
  return { env, file };
}

export const hubRef = () => JSON.parse(fs.readFileSync(path.join(here, 'hub-ref.json'), 'utf8'));

// Management API PAT: 일반 이름이 먼저, 계정별 이름(SUPABASE_ACCESS_TOKEN_<account>)이 그 다음.
function pat() {
  const { env, file } = loadEnv();
  const ref = hubRef();
  const key = env.SUPABASE_ACCESS_TOKEN || env[`SUPABASE_ACCESS_TOKEN_${ref.account || ''}`];
  if (!key) throw new Error(`SUPABASE_ACCESS_TOKEN${ref.account ? ` (또는 SUPABASE_ACCESS_TOKEN_${ref.account})` : ''} missing in ${file}`);
  return key;
}

async function call(method, p, body) {
  const ref = hubRef();
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref.ref}${p}`, {
    method,
    headers: { Authorization: `Bearer ${pat()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}
export async function runSql(query) { return call('POST', '/database/query', { query }); }

async function main() {
  const dry = args.includes('--dry');
  envOverride = opt('--env');
  const ref = hubRef();
  const { env, file } = loadEnv();
  try { pat(); } catch (e) { console.error(e.message); process.exit(2); }
  console.log(`env: ${file}`);
  // 1) 마이그레이션(파일명 순, meta.migrations 에 적용 목록 기록)
  const dir = path.join(here, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  let applied = [];
  try { const r = await runSql(`select value from public.meta where key = 'migrations'`); applied = r[0] ? JSON.parse(r[0].value) : []; } catch {}
  for (const f of files) {
    if (applied.includes(f)) { console.log(`skip ${f}`); continue; }
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    if (dry) { console.log(`would apply ${f} (${sql.length} chars)`); continue; }
    await runSql(sql);
    applied.push(f);
    await runSql(`insert into public.meta(key, value) values ('migrations', '${JSON.stringify(applied).replace(/'/g, "''")}') on conflict (key) do update set value = excluded.value`);
    console.log(`applied ${f}`);
  }
  // 1b) 의견함(0005_feedback) 알림 메일 비밀 값 → Supabase Vault. 값은 SQL 로만 지나가고 화면·파일 어디에도 찍지 않는다.
  //     값이 없으면 의견은 저장되고 알림 메일만 꺼진다(submit_feedback 이 Vault 에 값이 없으면 보내지 않음).
  if (!dry && applied.includes('0005_feedback.sql')) {
    const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const sec = { resend_api_key: env.RESEND_API_KEY, feedback_mail_from: env.IRIS_MESSENGER_MAIL_FROM, feedback_mail_to: env.IRIS_FEEDBACK_MAIL_TO };
    for (const [name, val] of Object.entries(sec)) {
      if (!val) { console.warn(`vault ${name}: secrets .env 에 값이 없어 의견 알림 메일은 꺼진 채로 둔다`); continue; }
      await runSql(`do $v$ declare v uuid; begin select id into v from vault.secrets where name = ${lit(name)}; if v is null then perform vault.create_secret(${lit(val)}, ${lit(name)}); else perform vault.update_secret(v, ${lit(val)}); end if; end $v$;`);
      console.log(`vault ${name} set`);
    }
  }
  // 2) Auth 설정
  if (!args.includes('--no-auth') && !dry) {
    const tpl = fs.readFileSync(path.join(here, 'email-otp.html'), 'utf8');
    const from = env.IRIS_MESSENGER_MAIL_FROM; // 예: iris@example.com — Resend 에 검증된 도메인이어야 함
    const hasSmtp = !!(from && env.RESEND_API_KEY);
    const cfg = {
      mailer_otp_length: 6, mailer_otp_exp: 600,
      rate_limit_verify: 30, rate_limit_otp: 30,
      external_anonymous_users_enabled: false, mailer_autoconfirm: false, disable_signup: false,
    };
    // 메일 틀·제목·rate_limit_email_sent·smtp_sender_name 은 커스텀 SMTP 없이는 Management API가 거부한다(실측:
    // 401 "Custom SMTP required to configure SMTP_SENDER_NAME or RATE_LIMIT_EMAIL_SENT", 400 "Email template
    // modification is not available for free tier projects using the default email provider") → SMTP 없을 때는
    // 이 키들을 전부 빼고 Supabase 기본 메일(팀원 전용, 시간당 몇 통)로 남긴다.
    if (hasSmtp) Object.assign(cfg, {
      mailer_subjects_magic_link: 'IRIS 메신저 로그인 코드', mailer_subjects_confirmation: 'IRIS 메신저 로그인 코드',
      mailer_templates_magic_link_content: tpl, mailer_templates_confirmation_content: tpl,
      rate_limit_email_sent: 60,
      smtp_host: 'smtp.resend.com', smtp_port: '465', smtp_user: 'resend', smtp_pass: env.RESEND_API_KEY, smtp_admin_email: from, smtp_sender_name: 'IRIS Messenger', smtp_max_frequency: 30,
    });
    else console.warn('IRIS_MESSENGER_MAIL_FROM/RESEND_API_KEY missing → Supabase built-in mail (team members only, few per hour); mailer template/subject/rate_limit_email_sent left at defaults');
    await call('PATCH', '/config/auth', cfg);
    console.log('auth config updated' + (cfg.smtp_host ? ` (smtp=${cfg.smtp_host}, from=${from})` : ' (built-in mail, defaults)'));
  }
  // 3) anon key → hub.json(이 저장소의 정본) + 옆 폴더의 메신저 저장소 module/hub.json(있을 때만, 같은 내용)
  const keys = await call('GET', '/api-keys?reveal=true');
  const anon = keys.find(k => k.name === 'anon')?.api_key;
  if (!anon) throw new Error('anon key not found');
  const hub = { url: ref.url, anonKey: anon, schema: 1 };
  const text = JSON.stringify(hub, null, 2) + '\n';
  // 메신저 사본 자리는 쓰기 전에 먼저 정한다 — 후보가 여럿이면 아무것도 쓰지 않고 멈춘다(엉뚱한 복제본을 고치지 않게).
  const given = opt('--messenger');
  const sibling = given ? path.join(path.resolve(given), 'module', 'hub.json') : messengerHubJson();
  if (given && !fs.existsSync(path.dirname(sibling))) throw new Error(`--messenger: module folder not found (${path.dirname(sibling)})`);
  if (!dry) fs.writeFileSync(path.join(root, 'hub.json'), text);
  console.log(`hub.json ${dry ? 'would be' : ''} written (url=${ref.url})`);
  if (sibling) {
    if (!dry) fs.writeFileSync(sibling, text);
    console.log(`messenger module/hub.json ${dry ? 'would be' : ''} synced (${sibling})`);
  } else console.log('messenger repo not found next to this repo — copy hub.json into its module/ by hand (or pass --messenger <repo>) if you build the module');
}

/** 옆 폴더(형제)에서 IRIS 메신저 저장소들의 module/hub.json 을 모두 찾는다. 폴더 번호가 아니라 내용(패키지 이름)으로 찾는다. */
export function messengerHubJsons(base = path.resolve(root, '..')) {
  let names = [];
  try { names = fs.readdirSync(base); } catch { return []; }
  const found = [];
  for (const n of names.sort()) {
    const dir = path.join(base, n);
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      const p = path.join(dir, 'module', 'hub.json');
      if (pkg.name === 'iris-messenger' && fs.existsSync(p)) found.push(p);
    } catch { /* 저장소가 아니거나 package.json 이 없는 폴더 */ }
  }
  return found;
}

/** 하나면 그 경로, 없으면 null, 둘 이상이면 멈춘다(어느 것을 맞출지 --messenger 로 알려 달라고). */
export function messengerHubJson(base = path.resolve(root, '..')) {
  const found = messengerHubJsons(base);
  if (found.length > 1) throw new Error(`more than one iris-messenger repo next to this repo — pass --messenger <repo>:\n  ${found.join('\n  ')}`);
  return found[0] || null;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
