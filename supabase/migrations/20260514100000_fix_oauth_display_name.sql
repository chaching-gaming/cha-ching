-- Fix handle_new_user to properly extract display_name and avatar_url from OAuth providers
-- Google OAuth uses: name, full_name, picture
-- Apple OAuth uses: full_name (but only on first sign-in via client)

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      'New User'
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    ),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
