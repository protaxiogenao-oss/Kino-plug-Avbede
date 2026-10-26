/// <reference path="./kino.d.ts" />

/**
 * Avbebe for Kino v1.0.0
 * Same shape as the 123AV plugin: search / home / browse / resolve.
 * Site: WordPress (JNews) — posts at /archives/{id}
 * Player: FV Flowplayer data-item → https://52cute.com/acg/watch/{id}/playlist.m3u8 (or video.m3u8)
 */

const BASE = "https://avbebe.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function log() {
  try {
    kino.log.apply(kino, arguments);
  } catch (_) {}
}

function headers(extra) {
  const h = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.7,en;q=0.5",
    Referer: BASE + "/",
  };
  if (extra) for (const k in extra) h[k] = extra[k];
  return h;
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#(\d+);/g, function (_, n) {
      return String.fromCharCode(parseInt(n, 10));
    })
    .replace(/&#x([0-9a-fA-F]+);/gi, function (_, h) {
      return String.fromCharCode(parseInt(h, 16));
    })
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]+>/g, "");
}

async function fetchText(path) {
  const url = path.indexOf("http") === 0 ? path : BASE + path;
  const r = await kino.fetch(url, { headers: headers() });
  if (r.status === 429) throw kino.error("rate_limited", "demasiadas peticiones");
  if (r.status === 404) throw kino.error("not_found");
  if (!r.ok) throw kino.error("unavailable", "el sitio respondió " + r.status);
  return r.text();
}

function withPage(path, page) {
  if (!page || page < 2) return path;
  // WordPress: /page/N/ or ?paged=N
  if (path.indexOf("?") >= 0) {
    return path + (path.indexOf("page=") >= 0 ? "" : "&paged=" + page);
  }
  // category/archive style
  if (/\/archives\/category\//i.test(path) || path === "/" || path === "") {
    const base = path.replace(/\/$/, "") || "";
    return base + "/page/" + page;
  }
  return path + (path.indexOf("?") >= 0 ? "&" : "?") + "paged=" + page;
}

/**
 * Parse listing cards from JNews / article.jeg_post blocks.
 */
function parseListing(html) {
  const items = [];
  const seen = {};

  function push(id, title, poster) {
    if (!id || seen[id]) return;
    seen[id] = true;
    let t = decodeEntities(stripTags(title || ""));
    if (!t || t.length < 2) t = "Post " + id;
    if (t.length > 200) t = t.slice(0, 197) + "…";
    let art = poster || undefined;
    if (art && /data:image|blank\.gif|bebelogo|1x1|spacer/i.test(art)) {
      art = undefined;
    }
    items.push({
      id: id,
      ref: id,
      title: t,
      kind: "movie",
      poster: art,
      backdrop: art,
      adult: true,
    });
  }

  // 1) Full article cards
  const artRe =
    /<article[^>]*class="[^"]*jeg_post[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = artRe.exec(html)) !== null) {
    const block = m[1];
    const hrefM = /href="https?:\/\/avbebe\.com\/archives\/(\d+)"/i.exec(block);
    if (!hrefM) continue;
    const id = hrefM[1];
    let title = "";
    const tM =
      /class="[^"]*jeg_post_title[^"]*"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i.exec(
        block
      ) || /<h[23][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (tM) title = tM[1];
    if (!title) {
      const aM = /alt="([^"]{2,200})"/i.exec(block);
      if (aM) title = aM[1];
    }
    let poster = "";
    const imgM =
      /data-src="(https:\/\/avbebe\.com\/wp-content\/uploads\/[^"]+)"/i.exec(
        block
      ) ||
      /src="(https:\/\/avbebe\.com\/wp-content\/uploads\/[^"]+\.(?:jpg|jpeg|webp|png)[^"]*)"/i.exec(
        block
      ) ||
      /background:url\('?(https:\/\/avbebe\.com\/wp-content\/uploads\/[^')\s]+)/i.exec(
        block
      );
    if (imgM) poster = imgM[1];
    push(id, title, poster);
  }

  // 2) Fallback: any /archives/ID + nearby title
  if (items.length < 5) {
    const anyRe = /href="https?:\/\/avbebe\.com\/archives\/(\d+)"/gi;
    while ((m = anyRe.exec(html)) !== null) {
      const id = m[1];
      if (seen[id]) continue;
      const around = html.slice(Math.max(0, m.index - 400), m.index + 500);
      let title = "";
      const tM =
        /(?:jeg_post_title|entry-title)[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i.exec(
          around
        ) || /alt="([^"]{2,200})"/i.exec(around);
      if (tM) title = tM[1];
      let poster = "";
      const imgM =
        /data-src="(https:\/\/avbebe\.com\/wp-content\/uploads\/[^"]+)"/i.exec(
          around
        ) ||
        /src="(https:\/\/avbebe\.com\/wp-content\/uploads\/[^"]+\.(?:jpg|jpeg|webp|png)[^"]*)"/i.exec(
          around
        );
      if (imgM) poster = imgM[1];
      push(id, title, poster);
    }
  }

  return items;
}

/** Extract HLS URL from FV Flowplayer data-item JSON on the post page. */
function extractStreamFromHtml(html, postId) {
  const found = [];
  // data-item="{&quot;sources&quot;:[{&quot;src&quot;:&quot;https:\/\/52cute.com\/...
  const re = /data-item="(\{[^"]+\})"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      let raw = m[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/\\\//g, "/");
      const data = JSON.parse(raw);
      const sources = (data && data.sources) || [];
      for (let i = 0; i < sources.length; i++) {
        const src = sources[i] && sources[i].src;
        if (src && /\.m3u8/i.test(src)) found.push(src.replace(/\\\//g, "/"));
      }
      if (data && data.splash && !found.splash) found.splash = data.splash;
    } catch (e) {
      log("data-item parse", e.message || e);
    }
  }
  // Plain m3u8 in page
  const plain = html.match(/https?:\\?\/\\?\/[^"'\\\s>]+\.m3u8[^"'\\\s>]*/gi);
  if (plain) {
    for (let i = 0; i < plain.length; i++) {
      const u = plain[i].replace(/\\\//g, "/");
      if (found.indexOf(u) < 0) found.push(u);
    }
  }
  // Constructed fallback from post id
  if (postId && !found.length) {
    found.push("https://52cute.com/acg/watch/" + postId + "/playlist.m3u8");
    found.push("https://52cute.com/acg/watch/" + postId + "/video.m3u8");
  }
  return found;
}

function streamHeaders(pageUrl) {
  return {
    "User-Agent": UA,
    Accept: "*/*",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.5",
    Referer: pageUrl || BASE + "/",
    Origin: "https://avbebe.com",
  };
}

// ---- search ----------------------------------------------------------------

export async function search(query) {
  await null;
  const q = String(query.q || "").trim();
  if (!q) return [];

  let path;
  let page = 1;
  if (query.cursor) {
    const c = String(query.cursor);
    if (c.indexOf("|") >= 0) {
      const parts = c.split("|");
      path = parts[0];
      page = parseInt(parts[1], 10) || 1;
    } else {
      path = c;
      const pm = c.match(/page[=/](\d+)/);
      if (pm) page = parseInt(pm[1], 10);
    }
  } else {
    path = "/?s=" + encodeURIComponent(q.slice(0, 80));
  }

  const html = await fetchText(withPage(path, page > 1 ? page : 0));
  const items = parseListing(html);
  const hasMore = items.length >= 12;
  if (hasMore && items.length) {
    return {
      items: items.slice(0, 100),
      next: path + "|" + (page + 1),
    };
  }
  return items.slice(0, 100);
}

// ---- home ------------------------------------------------------------------

async function rowFrom(path, id, title, limit) {
  try {
    const html = await fetchText(path);
    const items = parseListing(html);
    if (!items.length) return null;
    return {
      id: id,
      title: title,
      items: items.slice(0, limit || 60),
      ref: path,
    };
  } catch (e) {
    log("row", id, e.message || e);
    return null;
  }
}

export async function home() {
  await null;
  const rows = [];
  // maxHomeRows = 20, maxRowItems = 60
  const specs = [
    ["/", "home", "Inicio / Destacados"],
    ["/archives/category/new", "new", "新番 / New"],
    [
      "/archives/category/h%E5%8B%95%E7%95%AB%E5%BD%B1%E7%89%87",
      "h-anime",
      "H動畫",
    ],
    ["/archives/category/3d%E5%8B%95%E7%95%AB", "3d", "3D動畫"],
    ["/archives/category/%E6%B3%A1%E9%BA%B5%E7%95%AA", "short", "泡麵番"],
    [
      "/archives/category/%E9%A6%AC%E8%B3%BD%E5%85%8B%E7%A0%B4%E8%A7%A3",
      "uncensored",
      "馬賽克破解",
    ],
    ["/archives/category/%E8%8F%AF%E8%AA%9Eav", "chinese-av", "華語AV"],
    [
      "/archives/category/%E9%AB%98%E6%B8%85%E4%B8%AD%E5%AD%97",
      "hd-sub",
      "高清中字",
    ],
    [
      "/archives/category/%E9%AB%98%E6%B8%85%E7%B4%A0%E4%BA%BA",
      "amateur",
      "高清素人",
    ],
    ["/archives/category/%E7%B6%9C%E5%90%88av", "av", "綜合AV"],
  ];

  for (let i = 0; i < specs.length; i++) {
    if (rows.length >= 20) break;
    const row = await rowFrom(specs[i][0], specs[i][1], specs[i][2], 60);
    if (row) rows.push(row);
  }

  if (!rows.length) {
    throw kino.error("unavailable", "sin listados en avbebe.com");
  }
  return rows;
}

// ---- browse ----------------------------------------------------------------

export async function browse(ref, cursor) {
  await null;
  let path = String(ref || "/");
  let page = 1;
  if (cursor) {
    const c = String(cursor);
    if (c.indexOf("|") >= 0) {
      const parts = c.split("|");
      path = parts[0];
      page = parseInt(parts[1], 10) || 1;
    } else if (/^\d+$/.test(c)) {
      page = parseInt(c, 10);
    } else {
      path = c;
    }
  }
  const html = await fetchText(withPage(path, page > 1 ? page : 0));
  const items = parseListing(html);
  const hasMore = items.length >= 12;
  return {
    items: items.slice(0, 100),
    next: hasMore ? path + "|" + (page + 1) : undefined,
  };
}

// ---- resolve ---------------------------------------------------------------

export async function resolve(ref) {
  await null;
  let id = String(ref || "").trim();
  const um = id.match(/\/archives\/(\d+)/);
  if (um) id = um[1];
  id = id.replace(/[^0-9]/g, "");
  if (!id) throw kino.error("not_found", "ref vacío");

  const pageUrl = BASE + "/archives/" + id;
  let html;
  try {
    html = await fetchText("/archives/" + id);
  } catch (e) {
    throw kino.error("not_found", e.message || "post no encontrado");
  }

  let streams = extractStreamFromHtml(html, id);
  if (!streams.length) {
    // browser capture fallback
    if (kino.browser && typeof kino.browser.capture === "function") {
      try {
        const page = await kino.browser.capture(pageUrl, {
          timeoutMs: 20000,
          autoplay: true,
          match: "\\.m3u8|52cute",
        });
        const media = (page && page.media) || [];
        for (let i = 0; i < media.length; i++) {
          if (media[i].url && /\.m3u8/i.test(media[i].url)) {
            streams.push(media[i].url);
          }
        }
      } catch (e) {
        log("browser.capture", e.message || e);
      }
    }
  }

  if (!streams.length) {
    throw kino.error("unavailable", "no se encontró el stream HLS", {
      userMessage: "No se pudo obtener el enlace de reproducción.",
    });
  }

  // Prefer playlist.m3u8 then any m3u8
  streams.sort(function (a, b) {
    const score = function (u) {
      return (/playlist\.m3u8/i.test(u) ? 2 : 0) + (/\.m3u8/i.test(u) ? 1 : 0);
    };
    return score(b) - score(a);
  });

  const primary = streams[0];
  const hdrs = streamHeaders(pageUrl);
  const alternatives = [];
  for (let i = 1; i < Math.min(streams.length, 4); i++) {
    if (streams[i] !== primary) {
      alternatives.push({
        url: streams[i],
        label: "alt " + i,
        headers: hdrs,
        mime: "application/x-mpegURL",
      });
    }
  }

  return {
    url: primary,
    mime: "application/x-mpegURL",
    headers: hdrs,
    label: "HLS",
    alternatives: alternatives.length ? alternatives : undefined,
  };
}
