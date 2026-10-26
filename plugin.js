/// <reference path="./kino.d.ts" />

/**
 * TubePornClassic for Kino v1.0.0
 * Same shape as the 123AV plugin: search / home / browse / resolve,
 * quality setting, streamHosts any for rotating CDN (ahcdn, etc.).
 *
 * API (public JSON):
 *   GET /api/json/videos2/{life}/str/{sort}/{count}/..{page}.all...json
 *   GET /api/videos2.php?params=...&s=query  (search)
 *   GET /api/json/video/{life}/{folder}/{id}.json
 *   GET /api/videofile.php?video_id=&lifetime= → custom base164 → /get_file/...mp4
 */

const BASE = "https://tubepornclassic.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Custom alphabet used by the site's base164_decode (Cyrillic lookalikes). */
const B164 =
  "АВСDЕFGHIJKLМNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,~";

function headers(extra) {
  const h = {
    "User-Agent": UA,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: BASE + "/",
    Origin: BASE,
  };
  if (extra) for (const k in extra) h[k] = extra[k];
  return h;
}

function log(...args) {
  try {
    kino.log(...args);
  } catch (_) {}
}

function preferredQuality() {
  const q = String(kino.config.get("quality") || "best").toLowerCase();
  if (q === "1080" || q === "720" || q === "480") return q;
  return "best";
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
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCharCode(parseInt(n, 10));
      } catch {
        return "";
      }
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** Decode the site's custom base164 video_url payload. */
function base164Decode(encoded) {
  let e = String(encoded || "");
  e = e.replace(/[^АВСЕМA-Za-z0-9.,~]/g, "");
  let t = "";
  let s = 0;
  const a = B164;
  while (s < e.length) {
    let i = a.indexOf(e.charAt(s++));
    let o = s < e.length ? a.indexOf(e.charAt(s++)) : -1;
    let l = s < e.length ? a.indexOf(e.charAt(s++)) : -1;
    let n = s < e.length ? a.indexOf(e.charAt(s++)) : -1;
    if (i < 0) i = 0;
    if (o < 0) o = 0;
    if (l < 0) l = 64;
    if (n < 0) n = 64;
    const i2 = (i << 2) | (o >> 4);
    const o2 = ((15 & o) << 4) | (l >> 2);
    const r = ((3 & l) << 6) | n;
    t += String.fromCharCode(i2);
    if (l !== 64) t += String.fromCharCode(o2);
    if (n !== 64) t += String.fromCharCode(r);
  }
  return t;
}

function parseDurationMin(dur) {
  const t = String(dur || "").trim();
  if (!t) return undefined;
  const parts = t.split(":").map((x) => parseInt(x, 10) || 0);
  let secs = 0;
  if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) secs = parts[0] * 60 + parts[1];
  else return undefined;
  return secs > 0 ? Math.max(1, Math.round(secs / 60)) : undefined;
}

function qualityFromDims(dims) {
  const m = /(\d+)\s*x\s*(\d+)/i.exec(String(dims || ""));
  if (!m) return undefined;
  const h = parseInt(m[2], 10);
  if (h >= 1000) return "1080p";
  if (h >= 700) return "720p";
  if (h >= 480) return "480p";
  if (h > 0) return h + "p";
  return undefined;
}

/** Prefer landscape still (site screenshots are ~4:3 / 16:9 horizontal). */
function normalizeThumb(url) {
  if (!url) return undefined;
  let u = String(url).trim();
  if (!/^https?:\/\//i.test(u)) {
    if (u.startsWith("//")) u = "https:" + u;
    else if (u.startsWith("/")) u = BASE + u;
  }
  return u;
}

function toItem(v) {
  const id = String(v.video_id || v.id || "");
  if (!id) return null;
  const title = decodeEntities(v.title || id);
  const thumb = normalizeThumb(v.scr || v.thumb || v.thumbsrc);
  const dims = v.file_dimensions || "";
  const hd = v.props && (v.props.hd === "1" || v.props.hd === 1);
  return {
    id: id,
    ref: id,
    title: title.length > 200 ? title.slice(0, 197) + "…" : title,
    kind: "movie",
    poster: thumb,
    backdrop: thumb,
    quality: qualityFromDims(dims) || (hd ? "HD" : undefined),
    runtimeMinutes: parseDurationMin(v.duration),
    overview: v.dir || undefined,
    adult: true,
  };
}

function videosListPath(sort, page, count, section, objectId) {
  const life = 86400;
  const gender = "str";
  const c = count || 60;
  const p = page || 1;
  const sec = section || "";
  const oid = objectId || "";
  // /api/json/videos2/{life}/{gender}/{sort}/{count}/{section}.{object_id}.{page}.all...json
  return (
    "/api/json/videos2/" +
    life +
    "/" +
    gender +
    "/" +
    encodeURIComponent(sort) +
    "/" +
    c +
    "/" +
    sec +
    "." +
    oid +
    "." +
    p +
    ".all...json"
  );
}

function searchPath(q, page, count) {
  const life = 86400;
  const c = count || 60;
  const p = page || 1;
  return (
    "/api/videos2.php?params=" +
    life +
    "/str/relevance/" +
    c +
    "/search.." +
    p +
    ".all...&s=" +
    encodeURIComponent(String(q).slice(0, 80))
  );
}

function videoDetailPath(videoId) {
  const id = parseInt(String(videoId), 10);
  if (!id) return null;
  const life = 86400;
  const folder = 1000000 * Math.floor(id / 1000000) + "/" + 1000 * Math.floor(id / 1000);
  return "/api/json/video/" + life + "/" + folder + "/" + id + ".json";
}

async function fetchJson(path) {
  const url = path.indexOf("http") === 0 ? path : BASE + path;
  const r = await kino.fetch(url, { headers: headers() });
  if (r.status === 429) throw kino.error("rate_limited", "demasiadas peticiones");
  if (r.status === 404) throw kino.error("not_found");
  if (!r.ok) throw kino.error("unavailable", "el sitio respondió " + r.status);
  let data;
  try {
    data = r.json();
  } catch (e) {
    throw kino.error("unavailable", "respuesta no JSON");
  }
  if (data && data.error) {
    throw kino.error("unavailable", String(data.code || data.error));
  }
  return data;
}

function mapVideos(data) {
  const list = (data && data.videos) || [];
  const items = [];
  for (let i = 0; i < list.length; i++) {
    const it = toItem(list[i]);
    if (it) items.push(it);
  }
  return items;
}

async function rowFrom(sort, id, title, limit, section, objectId) {
  try {
    const path = videosListPath(sort, 1, limit || 60, section, objectId);
    const data = await fetchJson(path);
    const items = mapVideos(data);
    if (!items.length) return null;
    return {
      id: id,
      title: title,
      items: items.slice(0, limit || 60),
      ref: "sort:" + sort + (section ? ":" + section + ":" + (objectId || "") : ""),
      genre: "otros",
    };
  } catch (e) {
    log("row", id, e.message || e);
    return null;
  }
}

// ---- search ----------------------------------------------------------------

export async function search(query) {
  await null;
  const q = String(query.q || "").trim();
  if (!q) return [];

  let page = 1;
  if (query.cursor) {
    const c = String(query.cursor);
    if (/^\d+$/.test(c)) page = parseInt(c, 10) || 1;
    else {
      const m = /page=(\d+)/.exec(c);
      if (m) page = parseInt(m[1], 10) || 1;
      else if (c.indexOf("|") >= 0) page = parseInt(c.split("|")[1], 10) || 1;
    }
  }

  let data;
  try {
    data = await fetchJson(searchPath(q, page, 60));
  } catch (e) {
    log("search", e.message || e);
    throw kino.error("unavailable", e.message || "búsqueda falló");
  }

  const items = mapVideos(data).slice(0, 100);
  const total = parseInt(data.total_count, 10) || 0;
  const pages = parseInt(data.pages, 10) || 0;
  const hasMore = page < pages || (items.length >= 20 && (page * 60 < total || total === 0));
  if (hasMore && items.length) {
    return { items: items, next: String(page + 1) };
  }
  return items;
}

// ---- home ------------------------------------------------------------------

export async function home() {
  await null;
  const rows = [];
  const specs = [
    ["latest-updates", "latest", "Recién agregados"],
    ["most-popular", "popular", "Más populares"],
    ["top-rated", "top", "Mejor valorados"],
    ["longest", "longest", "Más largos"],
  ];
  for (let i = 0; i < specs.length; i++) {
    const row = await rowFrom(specs[i][0], specs[i][1], specs[i][2], 60);
    if (row) rows.push(row);
  }

  // Category rows (classic / vintage focus of the site)
  const cats = [
    ["classic", "Classic"],
    ["retro", "Retro"],
    ["vintage", "Vintage"],
    ["categories-anal", "Anal"],
    ["big-boobs", "Big Tits"],
    ["big-butts", "Big Ass"],
    ["categories-latin", "Latina"],
    ["teens", "Teens (18+)"],
    ["milf", "MILF"],
  ];
  for (let i = 0; i < cats.length; i++) {
    if (rows.length >= 20) break;
    const row = await rowFrom(
      "latest-updates",
      "cat-" + cats[i][0],
      cats[i][1],
      48,
      "categories",
      cats[i][0]
    );
    if (row) rows.push(row);
  }

  if (!rows.length) {
    throw kino.error("unavailable", "sin listados de TubePornClassic");
  }
  return rows;
}

// ---- browse ----------------------------------------------------------------

export async function browse(ref, cursor) {
  await null;
  let sort = "latest-updates";
  let section = "";
  let objectId = "";
  let page = 1;

  const r = String(ref || "");
  if (r.indexOf("sort:") === 0) {
    const parts = r.split(":");
    sort = parts[1] || sort;
    if (parts[2]) section = parts[2];
    if (parts[3]) objectId = parts[3];
  } else if (r) {
    sort = r;
  }

  if (cursor) {
    const c = String(cursor);
    if (/^\d+$/.test(c)) page = parseInt(c, 10) || 1;
    else if (c.indexOf("|") >= 0) page = parseInt(c.split("|").pop(), 10) || 1;
  }

  let data;
  try {
    data = await fetchJson(videosListPath(sort, page, 60, section, objectId));
  } catch (e) {
    log("browse", e.message || e);
    throw kino.error("unavailable", e.message || "browse falló");
  }

  const items = mapVideos(data).slice(0, 100);
  const pages = parseInt(data.pages, 10) || 0;
  const hasMore = page < pages || items.length >= 20;
  return {
    items: items,
    next: hasMore ? String(page + 1) : undefined,
  };
}

// ---- resolve ---------------------------------------------------------------

export async function resolve(ref) {
  await null;
  let id = String(ref || "").trim();
  const um = id.match(/(?:videos?\/|^)(\d{4,})/);
  if (um) id = um[1];
  id = id.replace(/[^0-9]/g, "");
  if (!id) throw kino.error("not_found", "ref vacío");

  // Optional: load detail for title sanity (not required for stream)
  try {
    const dpath = videoDetailPath(id);
    if (dpath) await fetchJson(dpath);
  } catch (e) {
    log("detail", e.message || e);
  }

  const vfUrl =
    BASE +
    "/api/videofile.php?video_id=" +
    encodeURIComponent(id) +
    "&lifetime=8640000";
  const r = await kino.fetch(vfUrl, {
    headers: headers({
      Accept: "application/json, text/plain, */*",
      Referer: BASE + "/videos/" + id + "/",
    }),
  });
  if (!r.ok) {
    throw kino.error("unavailable", "videofile " + r.status, {
      userMessage: "No se pudo obtener el enlace de reproducción.",
    });
  }

  let list;
  try {
    list = r.json();
  } catch (e) {
    throw kino.error("unavailable", "videofile no JSON");
  }
  if (!Array.isArray(list) || !list.length) {
    throw kino.error("unavailable", "sin formatos de vídeo", {
      userMessage: "Este título no tiene archivo de vídeo disponible.",
    });
  }

  const pref = preferredQuality();
  const streamHeaders = {
    Referer: BASE + "/",
    "User-Agent": UA,
  };

  function decodeEntry(item) {
    const enc = item && item.video_url;
    if (!enc) return null;
    let path = base164Decode(enc);
    if (!path) return null;
    if (path.indexOf("http") === 0) return path;
    if (path.charAt(0) !== "/") path = "/" + path;
    return BASE + path;
  }

  // Prefer default / best; optionally rank by format label if multiple
  let primary = null;
  const alternatives = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const url = decodeEntry(item);
    if (!url) continue;
    const label =
      (item.format && String(item.format).replace(/^\./, "").toUpperCase()) ||
      "MP4";
    const entry = {
      url: url,
      mime: "video/mp4",
      headers: streamHeaders,
      label: label,
    };
    if (!primary || item.is_default === 1 || item.is_default === "1") {
      if (primary) alternatives.push(primary);
      primary = entry;
    } else {
      alternatives.push(entry);
    }
  }

  if (!primary) {
    throw kino.error("unavailable", "no se decodificó el stream");
  }

  // Quality preference is soft: site often returns a single MP4 master size.
  // Keep alternatives if the API ever returns several.
  if (alternatives.length) {
    primary.alternatives = alternatives;
  }
  // Silence unused pref lint for future multi-format ranking
  void pref;

  return primary;
}
