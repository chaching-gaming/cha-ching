create or replace function public.update_profile(
  p_display_name text default null,
  p_avatar_url text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles;
begin
  update public.profiles
  set
    display_name = coalesce(p_display_name, display_name),
    avatar_url = coalesce(p_avatar_url, avatar_url)
  where id = auth.uid()
  returning * into updated_profile;

  return updated_profile;
end;
$$;
