export const onRequestPost = async () => {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', 'admin_sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};
