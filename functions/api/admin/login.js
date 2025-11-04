export const onRequestPost = async ({ request, env }) => {
  try {
    const { password } = await request.json().catch(() => ({}));
    if (!password) {
      return new Response(JSON.stringify({ error: 'password_required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const secret = env.ADMIN_SECRET;
    if (!secret) {
      return new Response(JSON.stringify({ error: 'admin_not_configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    if (password !== secret) {
      return new Response(JSON.stringify({ error: 'invalid_secret' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const adminSid = crypto.randomUUID();
    
    // Zapisz sesję admina w KV (ważna 24h)
    const adminSession = { 
      createdAt: Date.now(), 
      lastSeen: Date.now(),
      ip: request.headers.get('CF-Connecting-IP') || 'unknown'
    };
    await env.SESSIONS.put(`admin:${adminSid}`, JSON.stringify(adminSession), { expirationTtl: 86400 });
    
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.append('Set-Cookie', `admin_sid=${encodeURIComponent(adminSid)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
