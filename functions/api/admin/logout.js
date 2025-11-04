export const onRequestPost = async ({ request, env }) => {
  try {
    // Pobierz admin_sid z ciasteczek
    const cookies = Object.fromEntries(
      (request.headers.get('Cookie') || '')
        .split(';')
        .map(c => c.trim().split('=').map(decodeURIComponent))
        .filter(([k]) => k)
    );
    const adminSid = cookies.admin_sid;
    
    // Usuń sesję z KV jeśli istnieje
    if (adminSid) {
      await env.SESSIONS.delete(`admin:${adminSid}`);
    }
    
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.append('Set-Cookie', 'admin_sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
