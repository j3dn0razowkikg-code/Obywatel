export const onRequestGet = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const prefix = url.searchParams.get('prefix') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 200);
    const cursor = url.searchParams.get('cursor') || undefined;

    const list = await env.TOKENS.list({ prefix, limit, cursor });
    const keys = list.keys || [];

    // Batch fetch token JSONs
    const results = await Promise.all(keys.map(async (k) => {
      const val = await env.TOKENS.get(k.name, { type: 'json' });
      const active = !!(val && val.active !== false);
      const used = !!(val && val.used === true);
      const expiresInMs = val && val.expiresInMs ? val.expiresInMs : null;
      
      let expiresAt = null;
      // Jeśli token został użyty, znajdź sesję i pobierz expiresAt
      if (used) {
        const sessionsList = await env.SESSIONS.list({ prefix: 'sess:' });
        for (const sessKey of sessionsList.keys) {
          const sess = await env.SESSIONS.get(sessKey.name, { type: 'json' });
          if (sess && sess.token === k.name && sess.expiresAt) {
            expiresAt = sess.expiresAt;
            break;
          }
        }
      }
      
      return { key: k.name, active, used, expiresAt, expiresInMs };
    }));
    

    return new Response(JSON.stringify({ items: results, list_complete: list.list_complete, cursor: list.cursor || null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const onRequestPost = async ({ request, env }) => {
  try {
    const body = await request.json().catch(() => ({}));
    let { key, active, expiresInDays, expiresInMinutes } = body || {};
    if (typeof key !== 'string') key = '';
    key = key.trim();
    if (!key || key.length > 128 || /\s/.test(key)) {
      return new Response(JSON.stringify({ error: 'invalid_key' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (typeof active !== 'boolean') active = true;

    const exists = await env.TOKENS.get(key);
    if (exists !== null) {
      return new Response(JSON.stringify({ error: 'already_exists' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }

    const tokenData = { active, used: false };
    
    // Store expiration duration (will be calculated from activation time)
    if (expiresInMinutes && typeof expiresInMinutes === 'number' && expiresInMinutes > 0) {
      tokenData.expiresInMs = expiresInMinutes * 60 * 1000;
    } else if (expiresInDays && typeof expiresInDays === 'number' && expiresInDays > 0) {
      tokenData.expiresInMs = expiresInDays * 24 * 60 * 60 * 1000;
    }

    await env.TOKENS.put(key, JSON.stringify(tokenData));
    return new Response(JSON.stringify({ ok: true, key, active, used: false, expiresAt: null, expiresInMs: tokenData.expiresInMs || null }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const onRequestPatch = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if (!key) return new Response(JSON.stringify({ error: 'key_required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const body = await request.json().catch(() => ({}));
    if (!('active' in body) && !('used' in body) && !('expiresInDays' in body) && !('expiresInMinutes' in body)) {
      return new Response(JSON.stringify({ error: 'nothing_to_update' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const current = await env.TOKENS.get(key, { type: 'json' });
    if (!current) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    const updated = { ...current };
    if ('active' in body) updated.active = !!body.active;
    if ('used' in body) updated.used = !!body.used;
    if ('expiresInMinutes' in body) {
      const expiresInMinutes = body.expiresInMinutes;
      if (expiresInMinutes === null || expiresInMinutes === 0) {
        delete updated.expiresInMs;
      } else if (typeof expiresInMinutes === 'number' && expiresInMinutes > 0) {
        updated.expiresInMs = expiresInMinutes * 60 * 1000;
      }
    } else if ('expiresInDays' in body) {
      const expiresInDays = body.expiresInDays;
      if (expiresInDays === null || expiresInDays === 0) {
        delete updated.expiresInMs;
      } else if (typeof expiresInDays === 'number' && expiresInDays > 0) {
        updated.expiresInMs = expiresInDays * 24 * 60 * 60 * 1000;
      }
    }
    await env.TOKENS.put(key, JSON.stringify(updated));
    
    // Jeśli token został użyty, znajdź sesję i pobierz expiresAt
    let expiresAt = null;
    if (updated.used) {
      const sessionsList = await env.SESSIONS.list({ prefix: 'sess:' });
      for (const sessKey of sessionsList.keys) {
        const sess = await env.SESSIONS.get(sessKey.name, { type: 'json' });
        if (sess && sess.token === key && sess.expiresAt) {
          expiresAt = sess.expiresAt;
          break;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, key, active: !!updated.active, used: !!updated.used, expiresAt, expiresInMs: updated.expiresInMs || null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const onRequestDelete = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if (!key) {
      return new Response(JSON.stringify({ error: 'key_required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const exists = await env.TOKENS.get(key);
    if (exists === null) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    await env.TOKENS.delete(key);
    return new Response(JSON.stringify({ ok: true, key }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
