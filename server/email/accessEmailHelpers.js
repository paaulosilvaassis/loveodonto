function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export async function findAuthUserByEmail(supabase, email) {
  const target = normalizeEmail(email);
  if (!target) return null;

  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = Array.isArray(data?.users) ? data.users : [];
    const match = users.find((user) => normalizeEmail(user?.email) === target);
    if (match) return match;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

export function isUserAlreadyRegisteredError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return (
    message.includes('already registered')
    || message.includes('already exists')
    || message.includes('user already')
    || message.includes('email address has already been registered')
    || code.includes('email_exists')
    || error?.status === 422
  );
}
