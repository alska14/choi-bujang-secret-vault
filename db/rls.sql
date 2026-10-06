-- 4단계 만들기 3: 학습 DB의 notes 테이블에 최소 권한과 행 단위 보안(RLS)을 적용합니다.
-- 다른 테이블은 건드리지 않습니다. 서버 API는 서버 전용 키(service_role)로 접속하므로
-- 이 정책의 영향을 받지 않고, 정책은 anon·authenticated로 직접 Data API를 부를 때 막아 줍니다.

-- 1) 기존 권한을 모두 회수한 뒤 authenticated에만 필요한 네 가지를 줍니다.
revoke all on table public.notes from public, anon, authenticated;
grant select, insert, update, delete on table public.notes to authenticated;

-- 2) RLS를 켜고 정책을 다시 만듭니다 (여러 번 실행해도 같은 결과).
alter table public.notes enable row level security;

drop policy if exists notes_select_own on public.notes;
drop policy if exists notes_insert_own on public.notes;
drop policy if exists notes_update_own on public.notes;
drop policy if exists notes_delete_own on public.notes;

-- 조회·삭제: 기존 행의 owner_id가 로그인한 사용자일 때만
create policy notes_select_own on public.notes
  for select to authenticated using (auth.uid() = owner_id);
create policy notes_delete_own on public.notes
  for delete to authenticated using (auth.uid() = owner_id);
-- 추가: 새 행의 owner_id가 로그인한 사용자일 때만
create policy notes_insert_own on public.notes
  for insert to authenticated with check (auth.uid() = owner_id);
-- 수정: 기존 행과 새 행의 owner_id가 모두 로그인한 사용자일 때만 (소유자 바꾸기 차단)
create policy notes_update_own on public.notes
  for update to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
