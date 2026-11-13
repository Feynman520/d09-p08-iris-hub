-- IRIS Messenger · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
-- 0005_feedback: IRIS 공용 DB 의 첫 다른 사용처 — 홈페이지·IRIS 창 「의견 보내기」(설계 정본 = D09 P07 docs/설계-의견함-2026-11-12.md).
-- 로그인 없이(anon) 넣기만 할 수 있는 우편함. 표는 아무도 직접 읽거나 고칠 수 없고, 넣기는 submit_feedback() 한 길뿐이다.
-- 지키는 것: 내용 4,000자 · 이메일 254자 · 같은 접속지 10분 5통 · 전체 하루 300통 · 표 20MB 넘으면 멈춤 · 봇 덫(p_trap).
-- 알림: 저장 뒤 pg_net 으로 Resend 에 메일 1통(하루 50통까지, source='test' 는 보내지 않음). 메일이 실패해도 저장은 남는다.
-- 비밀 값(Resend 열쇠·보내는/받는 주소)은 이 파일에 없다 — deploy.mjs 가 secrets .env 에서 읽어 Vault 에 넣는다.
-- 보관: 내용·이메일 모두 자동 삭제하지 않는다(2026-11-13 사용자 결정). 접속지 해시만 1일 뒤 지운다. 재실행 가능(idempotent).

create extension if not exists pg_net;

create table if not exists public.feedback (
  id bigserial primary key,
  receipt text not null unique,
  created_at timestamptz not null default now(),
  source text not null check (source in ('site', 'app', 'test')),
  kind text not null check (kind in ('bug', 'improve', 'feature', 'other')),
  place text not null check (place in ('install', 'face', 'messenger', 'site', 'unknown')),
  body text not null check (char_length(body) between 1 and 4000),
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  app_info text check (app_info is null or char_length(app_info) <= 300),
  status text not null default 'new' check (status in ('new', 'reading', 'done')),
  note text,
  mailed boolean not null default false
);
create index if not exists feedback_created_idx on public.feedback(created_at);
alter table public.feedback enable row level security;
revoke all on public.feedback from public, anon, authenticated;
revoke all on sequence public.feedback_id_seq from public, anon, authenticated;

-- 접속지 횟수 세기 전용. 원래 주소는 두지 않고 (주소+날짜) md5 만, 1일 뒤 지운다.
create table if not exists public.feedback_hits (
  ip_hash text,
  at timestamptz not null default now()
);
create index if not exists feedback_hits_idx on public.feedback_hits(ip_hash, at);
alter table public.feedback_hits enable row level security;
revoke all on public.feedback_hits from public, anon, authenticated;

create or replace function public.submit_feedback(
  p_kind text, p_place text, p_body text,
  p_email text default null, p_source text default 'site', p_app_info text default null, p_trap text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ip text := ''; v_hash text; n int; v_receipt text; v_title text;
  v_key text; v_from text; v_to text; v_sent int;
  v_kinds jsonb := '{"bug":"고장","improve":"바뀌면 좋을 점","feature":"있으면 좋을 기능","other":"그 밖의 말"}';
  v_places jsonb := '{"install":"설치","face":"IRIS 창","messenger":"메신저","site":"홈페이지","unknown":"잘 모름"}';
begin
  -- 봇 덫: 사람에게 안 보이는 칸이 채워졌으면 저장하지 않고 성공한 척한다.
  if coalesce(p_trap, '') <> '' then return 'F-00000000-000000'; end if;
  p_body := btrim(coalesce(p_body, ''));
  p_email := nullif(btrim(coalesce(p_email, '')), '');
  p_app_info := nullif(btrim(coalesce(p_app_info, '')), '');
  if p_body = '' then raise exception 'empty' using errcode = '22023'; end if;
  if char_length(p_body) > 4000 then raise exception 'too_long' using errcode = '22023'; end if;
  if coalesce(p_source, '') not in ('site', 'app', 'test') then raise exception 'bad_source' using errcode = '22023'; end if;

  begin
    v_ip := btrim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1));
  exception when others then v_ip := '';
  end;
  v_hash := case when v_ip = '' then null else md5(v_ip || ':' || current_date::text) end;
  delete from public.feedback_hits where at < now() - interval '1 day';
  if v_hash is not null then
    select count(*) into n from public.feedback_hits where ip_hash = v_hash and at > now() - interval '10 minutes';
    if n >= 5 then raise exception 'rate_limited' using errcode = '22023'; end if;
  end if;
  select count(*) into n from public.feedback where created_at > now() - interval '1 day';
  if n >= 300 then raise exception 'rate_limited' using errcode = '22023'; end if;
  if pg_total_relation_size('public.feedback') > 20 * 1024 * 1024 then raise exception 'full' using errcode = '22023'; end if;

  v_receipt := 'F-' || to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDD') || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  -- 종류·어디서·이메일 형식이 틀리면 표의 check 가 거부한다(22023/23514).
  insert into public.feedback(receipt, source, kind, place, body, email, app_info)
    values (v_receipt, p_source, p_kind, p_place, p_body, p_email, p_app_info);
  insert into public.feedback_hits(ip_hash) values (v_hash);

  -- 알림 메일: 실패해도 저장은 그대로 둔다(안쪽 블록의 오류는 삼킨다).
  if p_source <> 'test' then
    begin
      select count(*) into v_sent from public.feedback
        where mailed and created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
      if v_sent < 50 then
        select decrypted_secret into v_key from vault.decrypted_secrets where name = 'resend_api_key';
        select decrypted_secret into v_from from vault.decrypted_secrets where name = 'feedback_mail_from';
        select decrypted_secret into v_to from vault.decrypted_secrets where name = 'feedback_mail_to';
        if v_key is not null and v_from is not null and v_to is not null then
          v_title := left(split_part(p_body, E'\n', 1), 60);
          perform net.http_post(
            url := 'https://api.resend.com/emails',
            headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
            body := jsonb_strip_nulls(jsonb_build_object(
              'from', 'IRIS 의견함 <' || v_from || '>',
              'to', jsonb_build_array(v_to),
              'reply_to', p_email,
              'subject', '[IRIS 의견] ' || (v_kinds ->> p_kind) || ' · ' || (v_places ->> p_place) || ' — ' || v_title,
              'text', '접수 번호  ' || v_receipt || E'\n'
                || '종류       ' || (v_kinds ->> p_kind) || E'\n'
                || '어디서     ' || (v_places ->> p_place) || E'\n'
                || '보낸 곳    ' || case p_source when 'app' then 'IRIS 창' else '홈페이지' end || E'\n'
                || '답장       ' || coalesce(p_email, '(없음)') || E'\n'
                || case when p_app_info is not null then '앱 정보    ' || p_app_info || E'\n' else '' end
                || E'\n' || p_body || E'\n')));
          update public.feedback set mailed = true where receipt = v_receipt;
        end if;
      end if;
    exception when others then null;
    end;
  end if;
  return v_receipt;
end $$;
revoke all on function public.submit_feedback(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_feedback(text, text, text, text, text, text, text) to anon, authenticated;

insert into public.meta(key, value) values ('feedback', '0005') on conflict (key) do update set value = excluded.value;
