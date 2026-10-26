// Kino plugin: Avbebe — v1.0.0 (apiVersion 6)
// WordPress (avbebe.com) con embeds de StreamWish y reproductor propio.
// Basado en el patrón del plugin MissAV: browser.capture primero, fetch+parse de respaldo.

function log(...args) {
  try { kino.log(...args); } catch {}
}

function baseUrl() {
  const m = String(kino.config.get("mirror") || "https://avbebe.com").trim().replace(/\/+$/, "");
  return m || "https://avbebe.com";
}

function cleanText(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCharCode(Number(n)); } catch { return ""; } })
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ua() {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
}

// hosts de embed conocidos en avbebe (StreamWish y clones + player propio)
const EMBED_HOSTS = "streamwish|swhoi|awish|wishfast|filelions|lionmek|motvega|vudesu|axmoe|avbebe";
const POST_RE = /href="(https?:\/\/[^"]*?\/archives\/(\d{8,}))"/g;

function toItem(v) {
  return {
    id: v.id,
    ref: v.id,
    title: v.title,
    kind: "movie",
    poster: v.thumb,
    overview: v.code || undefined,
    adult: true,
  };
}

async function fetchHtml(path) {
  const base = baseUrl();
  const url = path.startsWith("http") ? path : base + (path.startsWith("/") ? path : "/" + path);
  const r = await kino.fetch(url, {
    headers: {
      "User-Agent": ua(),
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
      Referer: base + "/",
    },
    cookies: true,
    timeoutMs: 18000,
  });
  if (!r.ok) throw new Error("avbebe respondió " + r.status);
  return { html: r.text(), url: r.url };
}

/** Extrae entradas (posts) de una página de listado de WordPress. */
function parsePosts(html) {
  const items = [];
  const seen = new Set();

  // bloques <article ...>...</article> (fallback: 4000 chars tras cada href)
  const blocks = html.split(/<article[^>]*>/i);
  const chunks = blocks.length > 1 ? blocks.slice(1).map((b) => b.split(/<\/article>/i)[0]) : [html];

  for (const chunk of chunks) {
    POST_RE.lastIndex = 0;
    let m;
    while ((m = POST_RE.exec(chunk)) !== null) {
      const id = m[2];
      if (seen.has(id)) continue;
      let title = "";
      const tm = /title="([^"]{2,250})"/i.exec(m[0]);
      if (tm) title = cleanText(tm[1]);
      if (!title) {
        // texto del enlace más cercano
        const after = chunk.slice(Math.max(0, m.index - 200), m.index + 600);
        const am = /<a[^>]*>\s*([^<]{2,200})\s*<\/a>/i.exec(after);
        if (am) title = cleanText(am[1]);
      }
      if (!title || title.length < 2) title = "Avbebe " + id;

      let thumb;
      const cm = chunk.slice(m.index - 500, m.index + 500).match(/(?:data-src|src)="(https?:\/\/[^"]+\.(?:jpe?g|png|webp))"/i);
      if (cm) thumb = cm[1];

      seen.add(id);
      items.push({ id, title: title.slice(0, 200), thumb, code: undefined });
    }
  }
  return items;
}

// ---- search ----------------------------------------------------------------

export async function search(query) {
  const q = String(query.q || "").trim();
  if (!q) return [];
  const page = query.cursor ? Math.max(1, Number(query.cursor) || 1) : 1;
  let path = "/?s=" + encodeURIComponent(q);
  if (page > 1) path += "&paged=" + page;

  let html;
  try {
    html = (await fetchHtml(path)).html;
  } catch (e) {
    log("search", e.message || e);
    throw kino.error("unavailable", e.message || "búsqueda falló");
  }

  const cards = parsePosts(html);
  const items = cards.map(toItem);
  const next = cards.length >= 10 ? String(page + 1) : undefined;
  return next ? { items, next } : items;
}

// ---- home ------------------------------------------------------------------

export async function home() {
  const rows = [];
  const sections = [
    { id: "anime", title: "H動畫 (里番)", path: "/archives/category/" + encodeURIComponent("h動畫影片") },
    { id: "cartoon", title: "動畫卡通", path: "/archives/category/" + encodeURIComponent("動畫卡通") },
    { id: "3d", title: "3D動畫", path: "/archives/category/" + encodeURIComponent("3d動畫") },
    { id: "censored", title: "高清中字", path: "/archives/category/" + encodeURIComponent("高清中字") },
    { id: "chinese", title: "華語AV", path: "/archives/category/" + encodeURIComponent("華語av") },
    { id: "misc", title: "綜合AV", path: "/archives/category/" + encodeURIComponent("綜合av") },
  ];

  for (const sec of sections) {
    try {
      const { html } = await fetchHtml(sec.path);
      const cards = parsePosts(html).slice(0, 36);
      if (cards.length) {
        rows.push({ id: sec.id, title: sec.title, items: cards.map(toItem), ref: sec.path });
      }
    } catch (e) {
      log("home", sec.id, e.message || e);
    }
  }

  if (!rows.length) {
    throw kino.error("unavailable", "Sin listados (prueba mirror avbebe.love / avbebe.org en ajustes)");
  }
  return rows;
}

// ---- browse ----------------------------------------------------------------

export async function browse(ref, cursor) {
  const page = cursor ? Math.max(1, Number(cursor) || 1) : 1;
  let path = String(ref || "").replace(/^\/+/, "");
  if (!path) path = "/archives/category/" + encodeURIComponent("h動畫影片");
  if (page > 1) {
    path = path.replace(/\/+$/, "") + "/page/" + page; // WP: /category/x/page/2
  }

  let html;
  try {
    html = (await fetchHtml(path)).html;
  } catch (e) {
    // /page/2 puede fallar en algunas rutas: probar ?paged=
    try {
      const alt = String(ref).replace(/^\/+/, "").replace(/\/+$/, "") + "?paged=" + page;
      html = (await fetchHtml(alt)).html;
    } catch (e2) {
      log("browse", e.message || e);
      throw kino.error("unavailable", e.message || "browse falló");
    }
  }

  const cards = parsePosts(html);
  const items = cards.map(toItem);
  const next = cards.length >= 10 ? String(page + 1) : undefined;
  return { items, next };
}

// ---- resolve ---------------------------------------------------------------

export async function resolve(ref) {
  const id = String(ref || "").replace(/[^0-9]/g, "");
  if (!id) throw kino.error("not_found", "ref vacío");
  const base = baseUrl();
  const postUrl = base + "/archives/" + id;

  // ---- Camino A: browser oculto (captura m3u8 con cabeceras reales) ----
  const browserStream = await resolveViaBrowser(postUrl);
  if (browserStream) return browserStream;

  // ---- Camino B: fetch del post + extracción de embeds ----
  let html;
  try {
    html = (await fetchHtml("/archives/" + id)).html;
  } catch (e) {
    log("resolve fetch", e.message || e);
    throw kino.error("unavailable", "no se pudo abrir la entrada");
  }

  const streams = [];

  // B1: iframes de hosts conocidos (streamwish etc.)
  const iframeRe = new RegExp("<iframe[^>]+src=\"(https?://(?:(" + EMBED_HOSTS + ")[^\"]+)/(?:e/|embed[/?])[^\" ]+)\"", "gi");
  let im;
  while ((im = iframeRe.exec(html)) !== null) {
    const embedUrl = im[1];
    const m3u8 = await extractFromEmbed(embedUrl);
    if (m3u8) {
      streams.push({
        url: m3u8,
        label: "StreamWish HLS",
        mime: "application/x-mpegURL",
        headers: streamHeaders(embedUrl),
      });
    }
  }

  // B2: mp4/m3u8 directos en el propio post (player propio de avbebe)
  const directRe = /"(https?:\/\/[^"\s]+\.(?:m3u8|mp4))"/gi;
  let dm;
  while ((dm = directRe.exec(html)) !== null) {
    if (/(?:css|js|font)/i.test(dm[1])) continue;
    streams.push({
      url: dm[1],
      label: /\.m3u8/i.test(dm[1]) ? "Avbebe HLS" : "Avbebe MP4",
      mime: /\.m3u8/i.test(dm[1]) ? "application/x-mpegURL" : "video/mp4",
      headers: streamHeaders(postUrl),
    });
  }

  // B3: video src / source tags
  const srcRe = /<(?:video|source)[^>]+(?:src|data-src)="(https?:\/\/[^"]+\.(?:m3u8|mp4))"/gi;
  while ((dm = srcRe.exec(html)) !== null) {
    if (!streams.some((s) => s.url === dm[1])) {
      streams.push({ url: dm[1], label: "Avbebe", mime: /\.m3u8/i.test(dm[1]) ? "application/x-mpegURL" : "video/mp4", headers: streamHeaders(postUrl) });
    }
  }

  if (!streams.length) {
    throw kino.error("unavailable", "no se encontró ningún stream (ni browser ni embeds)");
  }

  const primary = streams[0];
  const alternatives = streams.slice(1, 7).map((s) => ({
    url: s.url, label: s.label, headers: s.headers, mime: s.mime,
  }));
  return {
    url: primary.url,
    mime: primary.mime,
    headers: primary.headers,
    label: primary.label,
    alternatives: alternatives.length ? alternatives : undefined,
  };
}

/** Descarga la página de embed (p.ej. swhoi.com/e/xxx) y extrae el m3u8. */
async function extractFromEmbed(embedUrl) {
  try {
    const r = await kino.fetch(embedUrl, {
      headers: {
        "User-Agent": ua(),
        Accept: "text/html,*/*",
        Referer: baseUrl() + "/",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
      },
      cookies: true,
      timeoutMs: 18000,
    });
    if (!r.ok) return null;
    const body = r.text();

    // patrones habituales de StreamWish/clones
    const patterns = [
      /sources:\s*\[\{[^}]*file:\s*"([^"]+\.m3u8[^"]*)"/i,
      /"file"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/i,
      /file:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/i,
      /src:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/i,
      /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i,
    ];
    for (const re of patterns) {
      const m = re.exec(body);
      if (m) return m[1].replace(/\\\//g, "/");
    }

    // algunas páginas empaquetan con eval(function(p,a,c,k,e,d)...': no se desempaqueta aquí;
    // la Camino A (browser.capture) cubre esos casos.
    return null;
  } catch (e) {
    log("embed", e.message || e);
    return null;
  }
}

function streamHeaders(referer) {
  return {
    "User-Agent": ua(),
    Referer: referer || baseUrl() + "/",
    Accept: "*/*",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
  };
}

// ---- Camino A: browser.capture ---------------------------------------------

async function resolveViaBrowser(postUrl) {
  if (!kino.browser || typeof kino.browser.capture !== "function") {
    log("browser.capture no disponible");
    return null;
  }

  try {
    log("browser.capture", postUrl);
    const opts = {
      timeoutMs: 24000,
      autoplay: true,
      match: "\\.m3u8|\\.mp4|streamwish|swhoi|awish|filelions|motvega",
      headers: { "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8" },
    };
    if (kino.browser.captureAll === true) {
      opts.captureAll = true;
      opts.alsoMatch = ["\\.m3u8", "\\.mp4", "streamwish", "swhoi"];
      opts.returnCookiesOnTimeout = true;
    }

    const page = await kino.browser.capture(postUrl, opts);

    let media = (page.media || []).slice();
    if (kino.browser.captureAll === true && page.requests && page.requests.length) {
      for (const req of page.requests) {
        if (!req || !req.url) continue;
        if (!/\.m3u8|\.mp4|streamwish|swhoi/i.test(req.url)) continue;
        if (media.some((m) => m.url === req.url)) continue;
        media.push({ url: req.url, headers: req.headers || {} });
      }
    }

    if (!media.length) {
      log("browser: sin media en", postUrl);
      return null;
    }

    media.sort((a, b) => {
      const score = (u) =>
        (/\.m3u8/i.test(u) ? 5 : 0) +
        (/streamwish|swhoi|awish/i.test(u) ? 2 : 0) +
        (/\.mp4/i.test(u) ? 1 : 0);
      return score(b.url) - score(a.url);
    });

    const primary = media[0];
    const headers = buildStreamHeaders(primary, page, postUrl);

    try {
      log("browser headers", Object.keys(headers).join(","), "cookie?", !!(headers.Cookie || headers.cookie));
    } catch {}

    log("browser OK", primary.url.slice(0, 90));

    const alternatives = [];
    const seen = new Set([primary.url]);
    for (let i = 1; i < media.length && alternatives.length < 6; i++) {
      if (seen.has(media[i].url)) continue;
      seen.add(media[i].url);
      alternatives.push({
        url: media[i].url,
        label: /\.m3u8/i.test(media[i].url) ? "HLS " + i : "MP4 " + i,
        headers: buildStreamHeaders(media[i], page, postUrl),
        mime: /\.m3u8/i.test(media[i].url) ? "application/x-mpegURL" : "video/mp4",
      });
    }

    return {
      url: primary.url,
      mime: /\.m3u8/i.test(primary.url) ? "application/x-mpegURL" : "video/mp4",
      headers,
      label: "Browser HLS",
      alternatives: alternatives.length ? alternatives : undefined,
    };
  } catch (e) {
    log("browser.capture error", (e && e.code) || "", e.message || e);
    return null;
  }
}

function buildStreamHeaders(mediaItem, page, pageUrl) {
  const h = {};
  const src = (mediaItem && mediaItem.headers) || {};
  for (const k of Object.keys(src)) {
    if (!src[k]) continue;
    const low = k.toLowerCase();
    if (low === "range" || low === "accept-encoding" || low === "host") continue;
    h[k] = String(src[k]);
  }

  const referer = h.Referer || h.referer || (page && page.finalUrl) || pageUrl || baseUrl() + "/";
  h.Referer = referer;
  delete h.referer;

  const uaV =
    (page && page.userAgent) ||
    h["User-Agent"] ||
    h["user-agent"] ||
    ua();
  h["User-Agent"] = uaV;
  delete h["user-agent"];

  let cookie = h.Cookie || h.cookie || "";
  if (page && page.cookies && typeof page.cookies === "object") {
    const parts = [];
    for (const name of Object.keys(page.cookies)) {
      const val = page.cookies[name];
      if (val == null || val === "") continue;
      parts.push(name + "=" + val);
    }
    if (parts.length) cookie = cookie ? cookie + "; " + parts.join("; ") : parts.join("; ");
  }
  if (cookie) { h.Cookie = cookie; delete h.cookie; }

  if (!h.Accept) h.Accept = "*/*";
  if (!h["Accept-Language"]) h["Accept-Language"] = "zh-TW,zh;q=0.9,en;q=0.8";
  return h;
}