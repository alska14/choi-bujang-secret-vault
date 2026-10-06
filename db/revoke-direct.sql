-- 5단계 만들기 2: 브라우저가 공개 키로 notes 테이블을 직접 부르는 길을 닫습니다.
-- PUBLIC·anon·authenticated의 권한을 모두 회수합니다. 다른 테이블은 건드리지 않습니다.
-- 서버 함수는 서버 전용 키(service_role)로 접속하므로 영향을 받지 않고,
-- 서버 함수의 로그인·소유자 검사는 그대로입니다. RLS와 정책은 남겨 둡니다(이중 방어).
revoke all on table public.notes from public, anon, authenticated;
