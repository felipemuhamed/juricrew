create extension if not exists "uuid-ossp";
create table app_user
(
   id uuid primary key default uuid_generate_v4 (),
   email text unique not null,
   password_hash text not null,
   display_name text,
   created_at timestamptz default now ()
);
create table conversation
(
   id uuid primary key default uuid_generate_v4 (),
   user_id uuid not null references app_user (id) on delete cascade,
   title text,
   metadata jsonb default '{}'::jsonb,
   created_at timestamptz default now (),
   updated_at timestamptz default now ()
);
create table message
(
   id uuid primary key default uuid_generate_v4 (),
   conversation_id uuid not null references conversation (id) on delete cascade,
   role text not null check
   (
      role in
      (
         'user',
         'assistant',
         'system',
         'tool'
      )
   ),
   content text not null,
   model text,
   latency_ms int,
   created_at timestamptz default now (),
   metadata jsonb default '{}'::jsonb
);
create index if not exists idx_conversation_user_updated on conversation
(
   user_id,
   updated_at desc
);
create index if not exists idx_message_conversation_created on message
(
   conversation_id,
   created_at asc
);