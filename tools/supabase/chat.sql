-- 末世超市 好友和聊天（设计/20）—— 在 Supabase 的 SQL Editor 里整段贴进去，点 Run，跑一次就行
-- 表：profiles（玩家名片）、friends（好友关系）、messages（消息）；全部开 RLS，游戏里的公开 key 只能做下面允许的事

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text unique not null check (char_length(name) between 1 and 12),
  store_name text not null default '',
  store_lv int not null default 1,
  look jsonb not null default '{}'::jsonb,
  last_seen timestamptz not null default now()
);

create table if not exists public.friends (
  a uuid not null references public.profiles(id) on delete cascade,   -- 发申请的人
  b uuid not null references public.profiles(id) on delete cascade,   -- 被申请的人
  status text not null default 'pending' check (status in ('pending', 'ok')),
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a <> b)
);
create unique index if not exists friends_pair on public.friends (least(a, b), greatest(a, b));   -- 两个人之间只能有一条

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 100),
  created_at timestamptz not null default now(),
  read boolean not null default false
);
create index if not exists messages_to on public.messages (to_id, read);
create index if not exists messages_pair on public.messages (from_id, to_id, id);

-- 两个人是不是好友（给消息的权限用）
create or replace function public.are_friends(x uuid, y uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.friends where status = 'ok' and ((a = x and b = y) or (a = y and b = x)));
$$;

-- 每对好友只留最近 100 条
create or replace function public.trim_messages() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.messages where id in (
    select id from public.messages
    where (from_id = new.from_id and to_id = new.to_id) or (from_id = new.to_id and to_id = new.from_id)
    order by id desc offset 100);
  return null;
end $$;
drop trigger if exists trim_messages on public.messages;
create trigger trim_messages after insert on public.messages for each row execute function public.trim_messages();

-- 权限：只给登录的人（authenticated），没登录的（anon）什么都不能做
alter table public.profiles enable row level security;
alter table public.friends enable row level security;
alter table public.messages enable row level security;
grant usage on schema public to authenticated;
grant select, insert on public.profiles to authenticated;
grant update (store_name, store_lv, look, last_seen) on public.profiles to authenticated;   -- 名字不能改
grant select, insert, delete on public.friends to authenticated;
grant update (status) on public.friends to authenticated;
grant select, insert on public.messages to authenticated;
grant update (read) on public.messages to authenticated;                                    -- 只能标「已读」，不能改内容

drop policy if exists p_sel on public.profiles;
create policy p_sel on public.profiles for select to authenticated using (true);                       -- 搜名字、看名片
drop policy if exists p_ins on public.profiles;
create policy p_ins on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists p_upd on public.profiles;
create policy p_upd on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists f_sel on public.friends;
create policy f_sel on public.friends for select to authenticated using (auth.uid() in (a, b));
drop policy if exists f_ins on public.friends;
create policy f_ins on public.friends for insert to authenticated with check (a = auth.uid() and status = 'pending');
drop policy if exists f_upd on public.friends;
create policy f_upd on public.friends for update to authenticated using (b = auth.uid()) with check (b = auth.uid() and status = 'ok');   -- 只有被申请的人能同意
drop policy if exists f_del on public.friends;
create policy f_del on public.friends for delete to authenticated using (auth.uid() in (a, b));           -- 拒绝 / 删好友

drop policy if exists m_sel on public.messages;
create policy m_sel on public.messages for select to authenticated using (auth.uid() in (from_id, to_id));
drop policy if exists m_ins on public.messages;
create policy m_ins on public.messages for insert to authenticated with check (from_id = auth.uid() and public.are_friends(from_id, to_id));
drop policy if exists m_upd on public.messages;
create policy m_upd on public.messages for update to authenticated using (to_id = auth.uid()) with check (to_id = auth.uid());
