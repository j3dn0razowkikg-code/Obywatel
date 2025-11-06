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
      return { key: k.name, active, used };
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
    let { key, active } = body || {};
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

    await env.TOKENS.put(key, JSON.stringify({ active, used: false }));
    return new Response(JSON.stringify({ ok: true, key, active, used: false }), { status: 201, headers: { 'Content-Type': 'application/json' } });
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
    if (!('active' in body) && !('used' in body)) {
      return new Response(JSON.stringify({ error: 'nothing_to_update' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const current = await env.TOKENS.get(key, { type: 'json' });
    if (!current) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    const updated = { ...current };
    if ('active' in body) updated.active = !!body.active;
    if ('used' in body) updated.used = !!body.used;
    await env.TOKENS.put(key, JSON.stringify(updated));

    return new Response(JSON.stringify({ ok: true, key, active: !!updated.active, used: !!updated.used }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
