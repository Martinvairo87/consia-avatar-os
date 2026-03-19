// CONSIA AVATAR OS — Worker (D1 + R2)
// Endpoints:
// GET  /health
// POST /v1/avatars/create
// GET  /v1/avatars/list?owner_type=&owner_id=
// POST /v1/avatars/select
// POST /v1/avatars/assign
// POST /v1/avatars/render
// POST /v1/avatars/mirror   (stub MVP)

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const now = () => new Date().toISOString();
const uid = (p = "id") =>
  `${p}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

async function putJSON(env, key, obj) {
  await env.AVATAR_BUCKET.put(key, JSON.stringify(obj), {
    httpMetadata: { contentType: "application/json" },
  });
}

async function putText(env, key, txt, contentType = "text/plain") {
  await env.AVATAR_BUCKET.put(key, txt, {
    httpMetadata: { contentType },
  });
}

function publicUrl(env, key) {
  // usa dominio público R2
  return `${env.R2_PUBLIC_URL}/${key}`;
}

async function parseBody(req) {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await req.json();
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const out = {};
    for (const [k, v] of form.entries()) {
      if (v instanceof File) {
        out[k] = {
          filename: v.name,
          type: v.type,
          size: v.size,
          arrayBuffer: async () => await v.arrayBuffer(),
        };
      } else out[k] = v;
    }
    return out;
  }
  const txt = await req.text();
  try {
    return JSON.parse(txt || "{}");
  } catch {
    return {};
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    // --- HEALTH ---
    if (path === "/health") {
      return json({ ok: true, system: "CONSIA AVATAR OS", time: now() });
    }

    // --- CREATE AVATAR ---
    if (path === "/v1/avatars/create" && req.method === "POST") {
      const body = await parseBody(req);

      const avatar_id = uid("avt");
      const owner_type = body.owner_type || "user";
      const owner_id = body.owner_id || "unknown";
      const kind = body.kind || "generated";
      const name = body.name || `Avatar ${avatar_id}`;

      // estilo
      const style = body.style || {};
      const gender = style.gender || "female";
      const age = style.age || 30;
      const look = style.look || "natural premium";
      const hair = style.hair || "brown";
      const outfit = style.outfit || "elegant";

      // --- Imagen base (MVP: placeholder premium) ---
      // En fase siguiente conectás tu generador real
      const imgKey = `avatars/${avatar_id}.json`;
      const previewKey = `avatars/${avatar_id}_preview.txt`;

      const image_url = publicUrl(env, imgKey);
      const preview_url = publicUrl(env, previewKey);

      const created_at = now();

      // Guardar metadata
      await env.DB.prepare(
        `INSERT INTO avatars (
          avatar_id, owner_type, owner_id, kind, name,
          image_url, preview_url,
          voice_profile_id, motion_profile_id, style_profile_id,
          gender_hint, age_hint, language_default,
          is_active, is_public, created_at, updated_at
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,NULL,NULL,NULL,?8,?9,?10,1,0,?11,?11)`
      )
        .bind(
          avatar_id,
          owner_type,
          owner_id,
          kind,
          name,
          image_url,
          preview_url,
          gender,
          age,
          body.language || "es",
          created_at
        )
        .run();

      // Guardar “asset” (placeholder JSON)
      await putJSON(env, imgKey, {
        avatar_id,
        style: { gender, age, look, hair, outfit },
        note: "MVP asset (reemplazar por imagen real en Avatar Factory)",
      });

      await putText(
        env,
        previewKey,
        `CONSIA AVATAR ${avatar_id} — ${gender}, ${age}, ${look}`
      );

      return json({
        ok: true,
        avatar_id,
        image_url,
        preview_url,
      });
    }

    // --- LIST AVATARS ---
    if (path === "/v1/avatars/list" && req.method === "GET") {
      const owner_type = url.searchParams.get("owner_type");
      const owner_id = url.searchParams.get("owner_id");

      let q = `SELECT * FROM avatars WHERE is_active=1`;
      const binds = [];

      if (owner_type) {
        q += ` AND owner_type=?${binds.length + 1}`;
        binds.push(owner_type);
      }
      if (owner_id) {
        q += ` AND owner_id=?${binds.length + 1}`;
        binds.push(owner_id);
      }
      q += ` ORDER BY created_at DESC LIMIT 100`;

      const rows = await env.DB.prepare(q).bind(...binds).all();

      return json({ ok: true, items: rows.results || [] });
    }

    // --- SELECT AVATAR (USER) ---
    if (path === "/v1/avatars/select" && req.method === "POST") {
      const body = await parseBody(req);
      const { user_id, avatar_id } = body;

      if (!user_id || !avatar_id) {
        return json({ ok: false, error: "missing_user_or_avatar" }, 400);
      }

      const t = now();

      await env.DB.prepare(
        `INSERT INTO users (user_id, selected_avatar_id, created_at, updated_at)
         VALUES (?1,?2,?3,?3)
         ON CONFLICT(user_id) DO UPDATE SET
           selected_avatar_id=excluded.selected_avatar_id,
           updated_at=excluded.updated_at`
      )
        .bind(user_id, avatar_id, t)
        .run();

      return json({ ok: true, user_id, selected_avatar_id: avatar_id });
    }

    // --- ASSIGN AVATAR TO AGENT ---
    if (path === "/v1/avatars/assign" && req.method === "POST") {
      const body = await parseBody(req);
      const {
        agent_id,
        avatar_id,
        voice_profile_id = null,
        motion_profile_id = null,
      } = body;

      if (!agent_id || !avatar_id) {
        return json({ ok: false, error: "missing_agent_or_avatar" }, 400);
      }

      const t = now();

      await env.DB.prepare(
        `INSERT INTO agents (agent_id, agent_name, role, avatar_id, voice_profile_id, motion_profile_id, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?7)
         ON CONFLICT(agent_id) DO UPDATE SET
           avatar_id=excluded.avatar_id,
           voice_profile_id=excluded.voice_profile_id,
           motion_profile_id=excluded.motion_profile_id,
           updated_at=excluded.updated_at`
      )
        .bind(
          agent_id,
          body.agent_name || agent_id,
          body.role || "generic",
          avatar_id,
          voice_profile_id,
          motion_profile_id,
          t
        )
        .run();

      return json({ ok: true, agent_id, avatar_id });
    }

    // --- RENDER (cola + stub resultado) ---
    if (path === "/v1/avatars/render" && req.method === "POST") {
      const body = await parseBody(req);
      const {
        avatar_id,
        user_id = null,
        agent_id = null,
        text = "",
        voice_profile_id = null,
        motion_profile_id = null,
      } = body;

      if (!avatar_id) {
        return json({ ok: false, error: "missing_avatar_id" }, 400);
      }

      const render_id = uid("rnd");
      const t = now();

      // Guardar job
      await env.DB.prepare(
        `INSERT INTO avatar_renders (
          render_id, avatar_id, user_id, agent_id,
          input_text, input_audio_url, output_video_url,
          status, created_at, updated_at
        ) VALUES (?1,?2,?3,?4,?5,NULL,NULL,'queued',?6,?6)`
      )
        .bind(render_id, avatar_id, user_id, agent_id, text, t)
        .run();

      // MVP: generar “resultado” simple en R2 (reemplazar por pipeline real)
      const outKey = `renders/${render_id}.json`;
      await putJSON(env, outKey, {
        render_id,
        avatar_id,
        text,
        note: "MVP render (reemplazar por video real en Render Engine)",
        voice_profile_id,
        motion_profile_id,
      });

      const output_video_url = publicUrl(env, outKey);

      // actualizar estado a done (MVP)
      await env.DB.prepare(
        `UPDATE avatar_renders SET status='done', output_video_url=?1, updated_at=?2 WHERE render_id=?3`
      )
        .bind(output_video_url, now(), render_id)
        .run();

      return json({
        ok: true,
        render_id,
        status: "done",
        output_video_url,
      });
    }

    // --- MIRROR (stub MVP) ---
    if (path === "/v1/avatars/mirror" && req.method === "POST") {
      const body = await parseBody(req);
      const { user_id } = body;

      if (!user_id) {
        return json({ ok: false, error: "missing_user_id" }, 400);
      }

      const avatar_id = uid("avt_mirror");
      const t = now();

      // guardar avatar mirror básico
      await env.DB.prepare(
        `INSERT INTO avatars (
          avatar_id, owner_type, owner_id, kind, name,
          image_url, preview_url,
          voice_profile_id, motion_profile_id, style_profile_id,
          gender_hint, age_hint, language_default,
          is_active, is_public, created_at, updated_at
        ) VALUES (?1,'user',?2,'mirror',?3,?4,?5,NULL,NULL,NULL,NULL,NULL,'es',1,0,?6,?6)`
      )
        .bind(
          avatar_id,
          user_id,
          `Mirror ${user_id}`,
          publicUrl(env, `avatars/${avatar_id}.json`),
          publicUrl(env, `avatars/${avatar_id}_preview.txt`),
          t
        )
        .run();

      // setear como mirror del usuario
      await env.DB.prepare(
        `INSERT INTO users (user_id, mirror_avatar_id, created_at, updated_at)
         VALUES (?1,?2,?3,?3)
         ON CONFLICT(user_id) DO UPDATE SET
           mirror_avatar_id=excluded.mirror_avatar_id,
           updated_at=excluded.updated_at`
      )
        .bind(user_id, avatar_id, t)
        .run();

      return json({ ok: true, user_id, mirror_avatar_id: avatar_id });
    }

    return new Response("Not Found", { status: 404 });
  },
};
