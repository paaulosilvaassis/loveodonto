insert into public.platform_admin_users (
  id,
  email,
  full_name,
  role_slug,
  is_active
)
values (
  '5c159a4d-4ec5-4245-aa4e-466ea893344d'::uuid,
  'admin@loveodonto.com',
  'Admin Love Odonto',
  'owner',
  true
)
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  role_slug = excluded.role_slug,
  is_active = excluded.is_active,
  updated_at = now();