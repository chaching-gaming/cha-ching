-- Predefined question templates for bet creation (golf first; category extensible).

create table public.question_templates (
  id uuid primary key default gen_random_uuid(),
  question_text text not null,
  options jsonb not null,
  category text not null default 'golf',
  created_at timestamptz not null default now(),
  constraint question_templates_options_is_array
    check (jsonb_typeof(options) = 'array'),
  constraint question_templates_options_length
    check (jsonb_array_length(options) between 2 and 6)
);

create index idx_question_templates_category on public.question_templates (category);

-- Every array element must be a JSON string (CHECK cannot express this without a trigger).
create or replace function public.validate_question_template_options()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  elem jsonb;
begin
  for elem in select jsonb_array_elements from jsonb_array_elements(new.options)
  loop
    if jsonb_typeof(elem) is distinct from 'string' then
      raise exception 'question_templates.options must be a JSON array of strings only';
    end if;
  end loop;
  return new;
end;
$$;

create trigger question_templates_validate_options
  before insert or update of options on public.question_templates
  for each row
  execute procedure public.validate_question_template_options();

alter table public.question_templates enable row level security;

create policy "Authenticated users can read question templates"
on public.question_templates for select
to authenticated
using (true);

-- RPC: list templates by category (defaults to golf).
create or replace function public.list_question_templates(p_category text default 'golf')
returns setof public.question_templates
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.question_templates
  where category = p_category
    and jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 6
  order by question_text;
$$;

grant execute on function public.list_question_templates(text) to authenticated;

-- Seed golf templates
insert into public.question_templates (question_text, options, category) values
  (
    'Who wins the hole?',
    '["Player A","Player B","Halved"]'::jsonb,
    'golf'
  ),
  (
    'Will player make par?',
    '["Yes","No"]'::jsonb,
    'golf'
  ),
  (
    'Closest to the pin?',
    '["Player 1","Player 2","Neither"]'::jsonb,
    'golf'
  ),
  (
    'Gross or net score lower on this hole?',
    '["Gross","Net","Tie"]'::jsonb,
    'golf'
  ),
  (
    'Any birdie on the hole?',
    '["Yes","No"]'::jsonb,
    'golf'
  );
