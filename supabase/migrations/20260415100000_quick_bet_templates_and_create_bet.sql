-- Quick-bet UX: template tiles (short_label, slug), {player} in question_text, Yes/No options.
-- create_bet: optional p_subject_display_name for template question interpolation validation.

alter table public.question_templates
  add column if not exists short_label text,
  add column if not exists slug text;

delete from public.question_templates;

insert into public.question_templates (slug, short_label, question_text, options, category) values
  (
    'fairway',
    'Hit/Miss Fairway',
    'Will {player} hit the fairway on this hole?',
    '["Yes","No"]'::jsonb,
    'golf'
  ),
  (
    'green',
    'Hit/Miss Green',
    'Will {player} hit the green in regulation?',
    '["Yes","No"]'::jsonb,
    'golf'
  ),
  (
    'putt',
    'Make/Miss Putt',
    'Will {player} make this putt?',
    '["Yes","No"]'::jsonb,
    'golf'
  ),
  (
    'three_putt',
    'Three-Putt or Worse',
    'Will {player} three-putt (or worse) on this hole?',
    '["Yes","No"]'::jsonb,
    'golf'
  );

alter table public.question_templates alter column short_label set not null;
alter table public.question_templates alter column slug set not null;

create unique index if not exists question_templates_slug_key on public.question_templates (slug);

-- Replace create_bet (add p_subject_display_name for template match with {player})
revoke execute on function public.create_bet(uuid, text, jsonb, int, timestamptz, uuid) from authenticated;
drop function public.create_bet(uuid, text, jsonb, int, timestamptz, uuid);

create or replace function public.create_bet(
  p_room_id uuid,
  p_question text,
  p_options jsonb,
  p_stake int,
  p_expires_at timestamptz,
  p_template_id uuid default null,
  p_subject_display_name text default null
)
returns public.bets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_q text;
  v_opts jsonb;
  v_len int;
  v_i int;
  v_j int;
  v_s text;
  v_tpl public.question_templates;
  v_tpl_norm jsonb;
  v_bet public.bets;
  v_expected_q text;
begin
  if not public.is_room_member(p_room_id) then
    raise exception 'Not a member of this room' using errcode = 'P0001';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if v_room is null then
    raise exception 'Room not found' using errcode = 'P0002';
  end if;
  if not v_room.is_active then
    raise exception 'Session is not active' using errcode = 'P0003';
  end if;

  v_q := trim(p_question);
  if v_q = '' then
    raise exception 'Question is required' using errcode = 'P0004';
  end if;

  if p_stake is null or p_stake <= 0 then
    raise exception 'Stake must be a positive number' using errcode = 'P0005';
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'Expiry must be in the future' using errcode = 'P0006';
  end if;

  if jsonb_typeof(p_options) != 'array' then
    raise exception 'Options must be a JSON array' using errcode = 'P0007';
  end if;

  v_len := jsonb_array_length(p_options);
  if v_len < 2 or v_len > 6 then
    raise exception 'Options must have between 2 and 6 entries' using errcode = 'P0008';
  end if;

  v_opts := '[]'::jsonb;
  for v_i in 0..(v_len - 1) loop
    if jsonb_typeof(p_options -> v_i) is distinct from 'string' then
      raise exception 'Each option must be a string' using errcode = 'P0009';
    end if;
    v_s := trim(p_options ->> v_i);
    if v_s = '' then
      raise exception 'Options cannot be empty' using errcode = 'P0010';
    end if;
    for v_j in 0..(jsonb_array_length(v_opts) - 1) loop
      if lower(v_opts ->> v_j) = lower(v_s) then
        raise exception 'Duplicate options are not allowed' using errcode = 'P0011';
      end if;
    end loop;
    v_opts := v_opts || jsonb_build_array(v_s);
  end loop;

  if p_template_id is not null then
    select * into v_tpl from public.question_templates where id = p_template_id;
    if v_tpl is null then
      raise exception 'Template not found' using errcode = 'P0012';
    end if;
    if p_subject_display_name is null or trim(p_subject_display_name) = '' then
      raise exception 'Player name is required for this template' using errcode = 'P0015';
    end if;
    v_expected_q := trim(replace(trim(v_tpl.question_text), '{player}', trim(p_subject_display_name)));
    if v_q is distinct from v_expected_q then
      raise exception 'Question does not match template' using errcode = 'P0013';
    end if;
    v_tpl_norm := '[]'::jsonb;
    for v_i in 0..(jsonb_array_length(v_tpl.options) - 1) loop
      v_tpl_norm := v_tpl_norm || jsonb_build_array(trim(v_tpl.options ->> v_i));
    end loop;
    if v_tpl_norm is distinct from v_opts then
      raise exception 'Options do not match template' using errcode = 'P0014';
    end if;
  end if;

  insert into public.bets (
    room_id,
    question,
    options,
    stake,
    expires_at,
    status,
    offered_by,
    template_id
  )
  values (
    p_room_id,
    v_q,
    v_opts,
    p_stake,
    p_expires_at,
    'OPEN',
    auth.uid(),
    case when p_template_id is null then null else p_template_id::text end
  )
  returning * into v_bet;

  return v_bet;
end;
$$;

grant execute on function public.create_bet(uuid, text, jsonb, int, timestamptz, uuid, text) to authenticated;
