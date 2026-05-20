-- Add contextual labels for bet options (Hit/Miss, Make/Miss, Yes/No, etc.)
-- These labels are displayed on bet cards and detail screens based on template type.

alter table public.question_templates
  add column if not exists positive_label text not null default 'Yes',
  add column if not exists negative_label text not null default 'No';

-- Update existing templates with contextual labels
update public.question_templates
set positive_label = 'Hit', negative_label = 'Miss'
where slug in ('fairway', 'green');

update public.question_templates
set positive_label = 'Make', negative_label = 'Miss'
where slug = 'putt';

-- three_putt keeps Yes/No (default)

-- Update list_question_templates RPC to return the new columns
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

comment on column public.question_templates.positive_label is 'Label for the positive/affirmative option (e.g., Hit, Make, Yes)';
comment on column public.question_templates.negative_label is 'Label for the negative option (e.g., Miss, No)';
