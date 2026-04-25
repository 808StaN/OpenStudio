-- Tabela profiles (powiązana z auth.users)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  nickname text not null,
  email text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Włącz RLS
alter table profiles enable row level security;

-- Polityki RLS
create policy "Profiles are viewable by everyone"
  on profiles for select
  using (true);

create policy "Anyone can insert profile"
  on profiles for insert
  with check (true);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- Tabela projects (projekty użytkowników w chmurze)
create table projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  bpm integer not null default 140,
  storage_path text not null unique,
  file_size integer default 0,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, name)
);

-- Włącz RLS
alter table projects enable row level security;

-- Polityki RLS
create policy "Users CRUD own projects"
  on projects for all
  using (auth.uid() = user_id);
