// Gemensamt: Supabase-anrop mot schemat film, inloggning med gemensam kod, formatering.
// Samma upplägg som THT-appen (Lunkster/tht).

export const SUPABASE_URL = 'https://nlvgisjssbjethumvgdz.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_3wzcVvDgcoupfWSqAis4eg_bz2e6jiG'; // publik nyckel, skyddet är RLS
// Delat läsarkonto (rollen "film" i app_metadata). Koden är lösenordet. THT:s admin-konto får också läsa.
const KONTON = ['h.lundqvist+film@gmail.com', 'h.lundqvist+tht@gmail.com'];
const SESSION_KEY = 'filmstatistik-session';
const cache = new Map();

// ---------- läsa ----------
export async function api(path, { fresh = false } = {}) {
  if (!fresh && cache.has(path)) return cache.get(path);
  const s = await session(true);
  const p = fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Accept: 'application/json', 'Accept-Profile': 'film', Authorization: `Bearer ${s.access_token}` },
  }).then(async (r) => {
    if (r.status === 401) { logout(); location.hash = '#/'; }
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return r.json();
  });
  cache.set(path, p);
  try { return await p; } catch (e) { cache.delete(path); throw e; }
}

export const glomCache = () => cache.clear();

// Anropa en funktion i schemat film (POST /rpc/...)
export async function rpc(fn, args) {
  const s = await session(true);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Accept: 'application/json', 'Content-Type': 'application/json', 'Content-Profile': 'film', Authorization: `Bearer ${s.access_token}` },
    body: JSON.stringify(args),
  });
  if (r.status === 401) { logout(); location.hash = '#/'; }
  if (!r.ok) {
    let m = await r.text();
    try { m = JSON.parse(m).message ?? m; } catch { /* */ }
    throw new Error(m);
  }
  return r.json();
}

// PostgREST ger högst 1000 rader per anrop – hämta i sidor (path måste ha select= och order=)
export async function allaRader(path) {
  const ut = [];
  for (let off = 0; ; off += 1000) {
    const del = await api(`${path}&limit=1000&offset=${off}`);
    ut.push(...del);
    if (del.length < 1000) return ut;
  }
}

// ---------- inloggning ----------
function load() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
function save(s) { try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch { /* privat läge */ } }
let current = load();

async function auth(grant, body) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at };
}
export async function login(kod) {
  let s = null;
  for (const email of KONTON) { s = await auth('password', { email, password: kod }); if (s) break; }
  current = s; save(s); cache.clear();
  return !!s;
}
export function logout() { current = null; save(null); cache.clear(); }
export const inloggad = () => !!current;

async function session(required) {
  if (!current) { if (required) throw Object.assign(new Error('Inte inloggad'), { status: 401 }); return null; }
  if (current.expires_at * 1000 < Date.now() + 60_000) {
    const s = await auth('refresh_token', { refresh_token: current.refresh_token });
    if (!s) { logout(); if (required) throw Object.assign(new Error('Inloggningen har gått ut'), { status: 401 }); return null; }
    current = s; save(s);
  }
  return current;
}

// ---------- hjälp ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Svenskt talformat oavsett webbläsarens språk: mellanslag som tusentalsavgränsare, decimalkomma
export const fmt = (v, d = 0) => (v === null || v === undefined || Number.isNaN(Number(v))) ? '–'
  : Number(v).toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d });
export const tecken = (v, d = 2) => (v === null || v === undefined) ? '–' : (Number(v) > 0 ? '+' : Number(v) < 0 ? '−' : '±') + fmt(Math.abs(v), d);
export const enc = encodeURIComponent;
