// IRIS Hub · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// 의견함(0005_feedback) 읽기·처리 표시 — 에이전트에게 "의견 확인해줘"라고 하면 이 스크립트를 쓴다.
//   node server/ops/feedback.mjs                 새로·보는 중인 의견 목록(최근 것이 위)
//   node server/ops/feedback.mjs --all           전부(끝난 것 포함)
//   node server/ops/feedback.mjs show <접수번호>  한 통 전문
//   node server/ops/feedback.mjs mark <접수번호> <new|reading|done> [--note "메모"]
//   --json                                           사람용 글 대신 JSON
// 의견은 지우지 않는다(2026-11-13 사용자 결정). Management API(PAT)로만 읽으며 열쇠는 secrets .env 에서만 읽는다.
import { runSql } from '../deploy.mjs';

if (process.stdout.reconfigure) try { process.stdout.reconfigure({ encoding: 'utf8' }); } catch {}
const args = process.argv.slice(2);
const json = args.includes('--json');
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const KIND = { bug: '고장', improve: '바뀌면 좋을 점', feature: '있으면 좋을 기능', other: '그 밖의 말' };
const PLACE = { install: '설치', face: 'IRIS 창', messenger: '메신저', site: '홈페이지', unknown: '잘 모름' };
const STATUS = { new: '새로', reading: '보는 중', done: '끝' };
const kst = (t) => new Date(t).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
const RECEIPT = /^F-\d{8}-[0-9a-f]{4,6}$/;

async function main() {
  const [cmd, a1, a2] = args.filter(x => !x.startsWith('--') && !(args[args.indexOf(x) - 1] === '--note'));
  if (cmd === 'show') {
    if (!RECEIPT.test(a1 || '')) throw new Error('접수 번호 형식: F-YYYYMMDD-xxxxxx');
    const r = await runSql(`select * from public.feedback where receipt = ${lit(a1)}`);
    if (!r.length) throw new Error(`${a1} 없음`);
    const f = r[0];
    if (json) return console.log(JSON.stringify(f, null, 2));
    console.log(`${f.receipt}  ${kst(f.created_at)}  [${STATUS[f.status]}]`);
    console.log(`종류 ${KIND[f.kind]} · 어디서 ${PLACE[f.place]} · 보낸 곳 ${f.source === 'app' ? 'IRIS 창' : f.source === 'test' ? '시험' : '홈페이지'}`);
    console.log(`답장 ${f.email || '(없음)'}${f.app_info ? `\n앱 정보 ${f.app_info}` : ''}${f.note ? `\n메모 ${f.note}` : ''}`);
    console.log('\n' + f.body);
    return;
  }
  if (cmd === 'mark') {
    if (!RECEIPT.test(a1 || '') || !STATUS[a2]) throw new Error('사용: mark <접수번호> <new|reading|done> [--note "메모"]');
    const ni = args.indexOf('--note');
    const note = ni >= 0 ? args[ni + 1] : null;
    const r = await runSql(`update public.feedback set status = ${lit(a2)}${note != null ? `, note = ${lit(note)}` : ''} where receipt = ${lit(a1)} returning receipt, status`);
    if (!r.length) throw new Error(`${a1} 없음`);
    return console.log(json ? JSON.stringify(r[0]) : `${a1} → ${STATUS[a2]}`);
  }
  const where = args.includes('--all') ? `source <> 'test'` : `source <> 'test' and status <> 'done'`;
  const rows = await runSql(`select receipt, created_at, source, kind, place, status, email is not null as has_email, left(split_part(body, E'\\n', 1), 70) as title from public.feedback where ${where} order by created_at desc limit 200`);
  const tally = await runSql(`select status, count(*)::int as n from public.feedback where source <> 'test' group by status`);
  if (json) return console.log(JSON.stringify({ rows, tally }, null, 2));
  const t = Object.fromEntries(tally.map(x => [x.status, x.n]));
  console.log(`의견함: 새로 ${t.new || 0} · 보는 중 ${t.reading || 0} · 끝 ${t.done || 0}`);
  if (!rows.length) return console.log('(보여 줄 의견 없음)');
  for (const f of rows) console.log(`${f.receipt}  ${kst(f.created_at)}  [${STATUS[f.status]}] ${KIND[f.kind]}·${PLACE[f.place]}${f.source === 'app' ? '·창' : ''}${f.has_email ? '·답장' : ''}  ${f.title}`);
}
main().catch(e => { console.error(e.message); process.exit(1); });
