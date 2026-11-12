// Filmstatistik – vilka regissörer, skådespelare, genrer, bolag och länder jag gillar.
// Data: schemat film i Supabase (vyerna v_*, s_person). Se Obsidian: Film och serier - Datamodell.
import { api, allaRader, login, logout, inloggad, esc, fmt, tecken, enc } from './lib.js';

const VERSION = '0.2.0';
const app = document.getElementById('app');
const tipsEl = document.getElementById('tips');
const ROLLER = [
  ['regi', 'Regi'], ['skådespelare', 'Skådespelare'], ['manus', 'Manus'], ['förlaga', 'Förlaga'],
  ['producent', 'Producent'], ['exekutiv producent', 'Exekutiv producent'], ['foto', 'Foto'], ['musik', 'Musik'], ['klipp', 'Klipp'],
];
const tmdbUrl = (typ, id) => `https://www.themoviedb.org/${typ === 'serie' ? 'tv' : 'movie'}/${id}`;

// ---------- vems betyg ----------
let vem = (() => { try { return localStorage.getItem('filmstatistik-vem') || 'Henrik'; } catch { return 'Henrik'; } })();
const vemSel = document.getElementById('vem');
vemSel.addEventListener('change', () => { vem = vemSel.value; try { localStorage.setItem('filmstatistik-vem', vem); } catch { /* */ } visa(); });
async function laddaAnvandare() {
  const a = await api('anvandare?select=namn&order=id');
  vemSel.innerHTML = a.map((x) => `<option${x.namn === vem ? ' selected' : ''}>${esc(x.namn)}</option>`).join('');
  if (!a.some((x) => x.namn === vem)) { vem = a[0]?.namn; vemSel.value = vem; }
  document.querySelector('.vem').hidden = a.length < 2;
}
const V = () => `anvandare=eq.${enc(vem)}`;

// ---------- hjälp ----------
function stjarnor(b) {
  if (b == null) return '–';
  const hel = Math.floor(b), halv = b - hel >= 0.5;
  return `<span class="stjarnor" title="${fmt(b, 1)}">${'★'.repeat(hel)}${halv ? '½' : ''}</span>`;
}
// liten stapel för skillnad mot mitt snitt: blå = bättre, röd = sämre
function diffStapel(d, max = 1) {
  if (d == null) return '–';
  const w = Math.min(60, Math.round((Math.abs(d) / max) * 60));
  const farg = d >= 0 ? 'var(--pos)' : 'var(--neg)';
  return `<span class="diff">${tecken(d)} <span class="stapel${d < 0 ? ' neg' : ''}" style="width:${w}px;background:${farg}"></span></span>`;
}
function tips(e, html) {
  if (!html) { tipsEl.hidden = true; return; }
  tipsEl.innerHTML = html; tipsEl.hidden = false;
  const x = Math.min(e.clientX + 14, innerWidth - tipsEl.offsetWidth - 8);
  const y = Math.min(e.clientY + 14, innerHeight - tipsEl.offsetHeight - 8);
  tipsEl.style.left = `${x}px`; tipsEl.style.top = `${y}px`;
}
function kopplaTips(rot) {
  rot.querySelectorAll('[data-tips]').forEach((el) => {
    el.addEventListener('mousemove', (e) => tips(e, el.dataset.tips));
    el.addEventListener('mouseleave', () => tips(null, null));
  });
}
const params = () => new URLSearchParams(location.hash.split('?')[1] || '');
function satt(nyckel, varde) {
  const p = params(); if (varde === '' || varde == null) p.delete(nyckel); else p.set(nyckel, varde);
  const bas = location.hash.split('?')[0] || '#/';
  history.replaceState(null, '', `${bas}${p.toString() ? `?${p}` : ''}`);
}

// Stapeldiagram (en serie): [{etikett, varde, tips}]
function stapelDiagram(data, { hojd = 180, format = (v) => fmt(v) } = {}) {
  const W = 640, H = hojd, ml = 36, mb = 26, mt = 14;
  const max = Math.max(1, ...data.map((d) => d.varde));
  const steg = niceSteg(max);
  const top = Math.ceil(max / steg) * steg;
  const bw = (W - ml) / data.length;
  const y = (v) => mt + (H - mt - mb) * (1 - v / top);
  let s = `<svg class="diagram" viewBox="0 0 ${W} ${H}" role="img">`;
  for (let v = 0; v <= top; v += steg) s += `<line class="grid" x1="${ml}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${ml - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  data.forEach((d, i) => {
    const x = ml + i * bw + 2, w = Math.max(2, bw - 4), yy = y(d.varde), h = Math.max(0, y(0) - yy);
    const r = Math.min(4, w / 2, h);
    s += `<path d="M${x},${y(0)} V${yy + r} q0,-${r} ${r},-${r} H${x + w - r} q${r},0 ${r},${r} V${y(0)} Z" fill="var(--serie)"/>`;
    s += `<rect x="${ml + i * bw}" y="${mt}" width="${bw}" height="${H - mt - mb}" fill="transparent" data-tips="${esc(d.tips ?? `<b>${esc(d.etikett)}</b><br>${format(d.varde)}`)}"/>`;
    s += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${esc(d.etikett)}</text>`;
  });
  return `${s}<line class="axel" x1="${ml}" x2="${W}" y1="${y(0)}" y2="${y(0)}"/></svg>`;
}
function niceSteg(max) { const r = max / 4, p = 10 ** Math.floor(Math.log10(r)); return [1, 2, 5, 10].map((m) => m * p).find((m) => m >= r); }

// Liggande staplar för skillnad mot mitt snitt (diverging, nolla i mitten)
function diffDiagram(rader) {
  const W = 640, rad = 22, ml = 170, H = rader.length * rad + 24;
  const max = Math.max(0.5, ...rader.map((r) => Math.abs(r.diff)));
  const mid = ml + (W - ml) / 2, sk = (W - ml) / 2 / max;
  let s = `<svg class="diagram" viewBox="0 0 ${W} ${H}" role="img">`;
  rader.forEach((r, i) => {
    const yy = i * rad + 4, w = Math.abs(r.diff) * sk, x = r.diff >= 0 ? mid : mid - w;
    s += `<text x="${ml - 8}" y="${yy + 14}" text-anchor="end">${esc(r.namn)}</text>`;
    s += `<rect x="${x}" y="${yy + 3}" width="${Math.max(1, w)}" height="${rad - 8}" rx="4" fill="${r.diff >= 0 ? 'var(--pos)' : 'var(--neg)'}"/>`;
    s += `<rect x="0" y="${yy}" width="${W}" height="${rad}" fill="transparent" data-tips="${esc(r.tips)}"/>`;
  });
  s += `<line class="axel" x1="${mid}" x2="${mid}" y1="0" y2="${H - 20}"/>`;
  s += `<text x="${mid - 6}" y="${H - 4}" text-anchor="end">← sämre än mitt snitt</text><text x="${mid + 6}" y="${H - 4}">bättre →</text>`;
  return `${s}</svg>`;
}

// Sorterbar tabell: kolumner [{nyckel, rubrik, num, html(rad)}]
function tabell(rader, kol, { sort, upp = false, klick } = {}) {
  const id = `t${Math.random().toString(36).slice(2, 8)}`;
  let s = sort, u = upp;
  const rita = () => {
    const r = [...rader];
    if (s) r.sort((a, b) => { const x = a[s], y = b[s]; const c = (x ?? -Infinity) < (y ?? -Infinity) ? -1 : (x ?? -Infinity) > (y ?? -Infinity) ? 1 : 0; return u ? c : -c; });
    return `<thead><tr>${kol.map((k) => `<th class="${k.num ? 'num' : ''}${k.nyckel === s ? ` sorterad${u ? ' upp' : ''}` : ''}" ${k.nyckel ? `data-sort="${k.nyckel}"` : ''}>${k.rubrik}</th>`).join('')}</tr></thead>
      <tbody>${r.map((rad, i) => `<tr data-i="${rader.indexOf(rad)}"${klick ? ' class="klickbar"' : ''}>${kol.map((k) => `<td class="${k.num ? 'num' : ''}">${k.html ? k.html(rad) : esc(rad[k.nyckel])}</td>`).join('')}</tr>`).join('')}</tbody>`;
  };
  setTimeout(() => {
    const t = document.getElementById(id); if (!t) return;
    t.addEventListener('click', async (e) => {
      const th = e.target.closest('th[data-sort]');
      if (th) { const n = th.dataset.sort; if (n === s) u = !u; else { s = n; u = false; } t.innerHTML = rita(); return; }
      const tr = e.target.closest('tr[data-i]');
      if (tr && klick && !e.target.closest('a')) {
        const nasta = tr.nextElementSibling;
        if (nasta?.classList.contains('detalj')) { nasta.remove(); return; }
        const d = document.createElement('tr'); d.className = 'detalj';
        d.innerHTML = `<td colspan="${kol.length}"><span class="muted">Laddar …</span></td>`;
        tr.after(d);
        try { d.firstElementChild.innerHTML = await klick(rader[tr.dataset.i]); } catch (err) { d.firstElementChild.innerHTML = `<span class="fel">${esc(err.message)}</span>`; }
      }
    });
  });
  return `<div class="tabell-wrap"><table id="${id}">${rita()}</table></div>`;
}
const filmlista = (filmer) => filmer.length ? `<ul class="lista-filmer">${filmer.map((f) => `<li>${stjarnor(f.betyg)} <a href="${tmdbUrl(f.typ, f.tmdb_id)}" target="_blank" rel="noopener">${esc(f.titel)}</a> <span class="muted">${f.ar ?? ''}${f.karaktar ? ` · ${esc(f.karaktar)}` : ''}</span></li>`).join('')}</ul>` : '<span class="muted">Inga filmer.</span>';

// ---------- sidor ----------
async function oversikt() {
  const [filmer, regi, skad, snitt] = await Promise.all([
    allaRader(`v_film?${V()}&select=film_id,betyg,ar,datum,tmdb_betyg_5&order=film_id`),
    api(`s_person?${V()}&roll=eq.regi&antal_filmer=gte.3&order=justerat_betyg.desc&limit=8&select=namn,antal_filmer,snittbetyg,justerat_betyg,person_tmdb_id`),
    api(`s_person?${V()}&roll=eq.${enc('skådespelare')}&viktat_antal=gte.3&order=justerat_betyg.desc&limit=8&select=namn,antal_filmer,viktat_snitt,justerat_betyg,person_tmdb_id`),
    api(`v_snitt?select=anvandare_id,snitt,antal`),
  ]);
  const n = filmer.length;
  const medel = n ? filmer.reduce((a, f) => a + Number(f.betyg), 0) / n : null;
  const fordelning = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((b) => ({ etikett: fmt(b, b % 1 ? 1 : 0), varde: filmer.filter((f) => Number(f.betyg) === b).length }))
    .filter((d, i, a) => d.varde > 0 || (i > 0 && i < a.length - 1));
  const dec = new Map();
  filmer.forEach((f) => { if (!f.ar) return; const k = Math.floor(f.ar / 10) * 10; const d = dec.get(k) ?? { n: 0, s: 0, t: 0, tn: 0 }; d.n++; d.s += Number(f.betyg); if (f.tmdb_betyg_5 != null) { d.t += Number(f.tmdb_betyg_5); d.tn++; } dec.set(k, d); });
  const decData = [...dec.entries()].sort((a, b) => a[0] - b[0]).map(([k, d]) => ({ etikett: `${k}`, varde: d.n,
    tips: `<b>${k}-talet</b><br>${fmt(d.n)} filmer<br>Mitt snitt ${fmt(d.s / d.n, 2)}<br>TMDB-snitt ${d.tn ? fmt(d.t / d.tn, 2) : '–'}` }));
  const forsta = filmer.map((f) => f.datum).filter(Boolean).sort()[0];
  const topp = (rader, falt) => `<ol>${rader.map((r) => `<li><a href="https://www.themoviedb.org/person/${r.person_tmdb_id}" target="_blank" rel="noopener">${esc(r.namn)}</a> <span class="muted">${fmt(r.antal_filmer)} filmer, snitt ${fmt(r[falt], 2)}</span></li>`).join('')}</ol>`;
  app.innerHTML = `
    <h1>Översikt</h1><p class="muted">${esc(vem)}s betyg. Betygen kommer från Letterboxd; datumen från Filmtipset.</p>
    <div class="tiles">
      <div class="tile"><div class="v">${fmt(n)}</div><div class="k">filmer och serier</div></div>
      <div class="tile"><div class="v">${fmt(medel, 2)}</div><div class="k">snittbetyg</div></div>
      <div class="tile"><div class="v">${fmt(filmer.filter((f) => Number(f.betyg) >= 5).length)}</div><div class="k">femmor</div></div>
      <div class="tile"><div class="v">${fmt(filmer.filter((f) => Number(f.betyg) <= 1).length)}</div><div class="k">ettor eller lägre</div></div>
      <div class="tile"><div class="v liten">${forsta ?? '–'}</div><div class="k">första betyget</div></div>
    </div>
    <div class="rutnat">
      <div class="kort"><h2>Betygsfördelning</h2>${stapelDiagram(fordelning, { format: (v) => `${fmt(v)} filmer` })}</div>
      <div class="kort"><h2>Filmer per decennium</h2>${stapelDiagram(decData)}</div>
    </div>
    <div class="rutnat" style="margin-top:1rem">
      <div class="kort"><h2>Regissörer jag gillar mest</h2>${topp(regi, 'snittbetyg')}<a href="#/personer?roll=regi">Alla regissörer →</a></div>
      <div class="kort"><h2>Skådespelare jag gillar mest</h2>${topp(skad, 'viktat_snitt')}<a href="#/personer?roll=sk%C3%A5despelare">Alla skådespelare →</a></div>
    </div>
    <p class="muted">Topplistorna använder <b>justerat betyg</b>: som om man också sett tre filmer med sitt eget snittbetyg${snitt.length ? '' : ''}, så att en enda femma inte hamnar överst. Skådespelare viktas efter rollens storlek (1 för de tre första i rollistan, 0,5 för plats 4–10, 0,2 därefter).</p>`;
  kopplaTips(app);
}

async function personer() {
  const p = params();
  const roll = p.get('roll') || 'regi', min = Number(p.get('min') || 3), ordn = p.get('ordning') || 'bast', sok = p.get('sok') || '';
  const skad = roll === 'skådespelare';
  const filter = `${V()}&roll=eq.${enc(roll)}&${skad ? 'viktat_antal' : 'antal_filmer'}=gte.${min}${sok ? `&namn=ilike.*${enc(sok)}*` : ''}`;
  const rader = await api(`s_person?${filter}&order=justerat_betyg.${ordn === 'bast' ? 'desc' : 'asc'}&limit=100&select=namn,person_tmdb_id,antal_filmer,viktat_antal,snittbetyg,viktat_snitt,justerat_betyg,diff_mot_ditt_snitt`);
  app.innerHTML = `
    <h1>Personer</h1>
    <div class="filter">
      <label>Roll <select id="f-roll">${ROLLER.map(([v, t]) => `<option value="${v}"${v === roll ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Minst <input id="f-min" type="number" min="1" max="50" value="${min}" style="width:4.5em"> ${skad ? 'viktade filmer' : 'filmer'}</label>
      <span class="knappar"><button data-o="bast" class="${ordn === 'bast' ? 'aktiv' : ''}">Bäst</button><button data-o="samst" class="${ordn === 'samst' ? 'aktiv' : ''}">Sämst</button></span>
      <label>Sök <input id="f-sok" type="search" value="${esc(sok)}" placeholder="namn"></label>
    </div>
    ${rader.length ? tabell(rader, [
      { rubrik: '#', html: (r) => `<span class="muted">${rader.indexOf(r) + 1}</span>` },
      { nyckel: 'namn', rubrik: 'Namn', html: (r) => `<a href="https://www.themoviedb.org/person/${r.person_tmdb_id}" target="_blank" rel="noopener">${esc(r.namn)}</a>` },
      { nyckel: 'antal_filmer', rubrik: 'Filmer', num: true, html: (r) => fmt(r.antal_filmer) },
      ...(skad ? [{ nyckel: 'viktat_antal', rubrik: 'Viktat', num: true, html: (r) => fmt(r.viktat_antal, 1) }] : []),
      { nyckel: skad ? 'viktat_snitt' : 'snittbetyg', rubrik: skad ? 'Viktat snitt' : 'Snitt', num: true, html: (r) => fmt(skad ? r.viktat_snitt : r.snittbetyg, 2) },
      { nyckel: 'justerat_betyg', rubrik: 'Justerat', num: true, html: (r) => fmt(r.justerat_betyg, 2) },
      { nyckel: 'diff_mot_ditt_snitt', rubrik: 'Mot mitt snitt', html: (r) => diffStapel(r.diff_mot_ditt_snitt) },
    ], { klick: async (r) => {
      const fp = await api(`film_person?person_id=eq.${r.person_tmdb_id}&roll=eq.${enc(roll)}&select=film_id,karaktar,ordning`);
      if (!fp.length) return '<span class="muted">Inga filmer.</span>';
      const f = await api(`v_film?${V()}&film_id=in.(${fp.map((x) => x.film_id).join(',')})&select=film_id,titel,ar,betyg,typ,tmdb_id&order=betyg.desc,ar.asc`);
      const kar = new Map(fp.map((x) => [x.film_id, x.karaktar]));
      return filmlista(f.map((x) => ({ ...x, karaktar: kar.get(x.film_id) })));
    } }) : '<p class="muted">Inga personer med de inställningarna.</p>'}
    <p class="muted">Klicka på en rad för att se filmerna. Visar högst 100.</p>`;
  const ga = () => visa();
  document.getElementById('f-roll').onchange = (e) => { satt('roll', e.target.value); satt('min', e.target.value === 'skådespelare' ? 3 : 3); ga(); };
  document.getElementById('f-min').onchange = (e) => { satt('min', e.target.value); ga(); };
  let t; document.getElementById('f-sok').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { satt('sok', e.target.value.trim()); ga(); }, 350); };
  app.querySelectorAll('.knappar button').forEach((b) => { b.onclick = () => { satt('ordning', b.dataset.o); ga(); }; });
}

async function genrer() {
  const rader = await api(`v_genre?${V()}&order=diff_mot_ditt_snitt.desc&select=genre,antal,snittbetyg,diff_mot_ditt_snitt`);
  app.innerHTML = `
    <h1>Genrer</h1><p class="muted">En film kan ha flera genrer. Skillnaden är justerad som topplistorna, så små genrer dras mot mitt snitt.</p>
    <div class="kort">${diffDiagram(rader.filter((r) => r.antal >= 3).map((r) => ({ namn: r.genre, diff: Number(r.diff_mot_ditt_snitt), tips: `<b>${esc(r.genre)}</b><br>${fmt(r.antal)} filmer<br>Snitt ${fmt(r.snittbetyg, 2)}<br>Mot mitt snitt ${tecken(r.diff_mot_ditt_snitt)}` })))}</div>
    <h2>Tabell</h2>
    ${tabell(rader, [
      { nyckel: 'genre', rubrik: 'Genre' },
      { nyckel: 'antal', rubrik: 'Filmer', num: true, html: (r) => fmt(r.antal) },
      { nyckel: 'snittbetyg', rubrik: 'Snitt', num: true, html: (r) => fmt(r.snittbetyg, 2) },
      { nyckel: 'diff_mot_ditt_snitt', rubrik: 'Mot mitt snitt', html: (r) => diffStapel(r.diff_mot_ditt_snitt) },
    ], { sort: 'diff_mot_ditt_snitt', klick: (r) => filmerFor('film_genre', 'genre_id', 'genre', r.genre) })}`;
  kopplaTips(app);
}

async function filmerFor(koppling, faltId, tabellNamn, namn) {
  const g = await api(`${tabellNamn}?namn=eq.${enc(namn)}&select=tmdb_id`);
  if (!g.length) return '<span class="muted">Inga filmer.</span>';
  const kopp = await allaRader(`${koppling}?${faltId}=in.(${g.map((x) => x.tmdb_id).join(',')})&select=film_id&order=film_id`);
  const ids = [...new Set(kopp.map((x) => x.film_id))];
  const ut = [];
  for (let i = 0; i < ids.length; i += 150) ut.push(...await api(`v_film?${V()}&film_id=in.(${ids.slice(i, i + 150).join(',')})&select=titel,ar,betyg,typ,tmdb_id&order=betyg.desc,ar.asc`));
  ut.sort((a, b) => b.betyg - a.betyg || (a.ar ?? 0) - (b.ar ?? 0));
  return filmlista(ut);
}

async function filmerForLand(iso) {
  const kopp = await allaRader(`v_film_land?land=eq.${enc(iso)}&select=film_id&order=film_id`);
  const ids = [...new Set(kopp.map((x) => x.film_id))];
  const ut = [];
  for (let i = 0; i < ids.length; i += 150) ut.push(...await api(`v_film?${V()}&film_id=in.(${ids.slice(i, i + 150).join(',')})&select=titel,ar,betyg,typ,tmdb_id&order=betyg.desc,ar.asc`));
  ut.sort((a, b) => b.betyg - a.betyg || (a.ar ?? 0) - (b.ar ?? 0));
  return filmlista(ut);
}

async function bolag() {
  const p = params(); const min = Number(p.get('min') || 5), sok = p.get('sok') || '';
  const rader = await api(`v_bolag?${V()}&antal=gte.${min}${sok ? `&bolag=ilike.*${enc(sok)}*` : ''}&order=diff_mot_ditt_snitt.desc&limit=300&select=bolag,land,antal,snittbetyg,diff_mot_ditt_snitt`);
  app.innerHTML = `
    <h1>Bolag</h1><p class="muted">Produktionsbolag (och tv-kanaler för serier).</p>
    <div class="filter">
      <label>Minst <input id="f-min" type="number" min="1" max="50" value="${min}" style="width:4.5em"> filmer</label>
      <label>Sök <input id="f-sok" type="search" value="${esc(sok)}" placeholder="bolag"></label>
    </div>
    ${tabell(rader, [
      { nyckel: 'bolag', rubrik: 'Bolag' },
      { nyckel: 'land', rubrik: 'Land', html: (r) => esc(r.land ?? '') },
      { nyckel: 'antal', rubrik: 'Filmer', num: true, html: (r) => fmt(r.antal) },
      { nyckel: 'snittbetyg', rubrik: 'Snitt', num: true, html: (r) => fmt(r.snittbetyg, 2) },
      { nyckel: 'diff_mot_ditt_snitt', rubrik: 'Mot mitt snitt', html: (r) => diffStapel(r.diff_mot_ditt_snitt) },
    ], { sort: 'diff_mot_ditt_snitt', klick: (r) => filmerFor('film_bolag', 'bolag_id', 'bolag', r.bolag) })}`;
  document.getElementById('f-min').onchange = (e) => { satt('min', e.target.value); visa(); };
  let t; document.getElementById('f-sok').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { satt('sok', e.target.value.trim()); visa(); }, 350); };
}

let kartData = null;
// historiska landskoder i TMDB
const HISTORISKA = { SU: 'Sovjetunionen', YU: 'Jugoslavien', AN: 'Nederländska Antillerna', CS: 'Tjeckoslovakien', DD: 'Östtyskland', XC: 'Tjeckoslovakien', XG: 'Östtyskland' };
const ANTAL_STEG = [[1, '#104281'], [2, '#1c5cab'], [4, '#2a78d6'], [11, '#5598e7'], [31, '#86b6ef'], [101, '#b7d3f6']];
const DIFF_STEG = [[-Infinity, '#e66767'], [-0.5, '#b55553'], [-0.2, '#7d4542'], [-0.07, '#383835'], [0.07, '#24497a'], [0.2, '#2d65ab'], [0.5, '#3987e5']];
const steg = (lista, v) => lista.reduce((farg, [grans, f]) => (v >= grans ? f : farg), lista[0][1]);

async function lander() {
  const p = params(); const lage = p.get('visa') || 'antal';
  if (!kartData) kartData = await fetch(`karta.json?v=${VERSION}`).then((r) => r.json());
  const rader = await api(`v_land?${V()}&order=antal.desc&select=land,antal,snittbetyg,maxbetyg,minbetyg,diff_mot_ditt_snitt`);
  const per = new Map(rader.map((r) => [r.land, r]));
  const namn = new Map(kartData.lander.map((l) => [l.iso, l.namn]));
  const landNamn = (iso) => namn.get(iso) ?? HISTORISKA[iso] ?? iso;
  const tipsFor = (iso) => { const r = per.get(iso); return r ? `<b>${esc(landNamn(iso))}</b><br>${fmt(r.antal)} filmer<br>Snitt ${fmt(r.snittbetyg, 2)} · max ${fmt(r.maxbetyg, 1)} · min ${fmt(r.minbetyg, 1)}<br>Mot mitt snitt ${tecken(r.diff_mot_ditt_snitt)}` : `<b>${esc(landNamn(iso))}</b><br>inga filmer`; };
  const fargFor = (iso) => { const r = per.get(iso); if (!r) return '#2a2724'; return lage === 'antal' ? steg(ANTAL_STEG, r.antal) : steg(DIFF_STEG, Number(r.diff_mot_ditt_snitt)); };
  const karta = `<svg class="diagram karta" viewBox="0 0 ${kartData.w} ${kartData.h}" role="img" aria-label="Världskarta">${kartData.lander.map((l) => `<path d="${l.d}" fill="${fargFor(l.iso)}" data-tips="${esc(tipsFor(l.iso))}"/>`).join('')}</svg>`;
  const forkl = lage === 'antal'
    ? `<div class="forklaring">Antal filmer: <span class="skala">${ANTAL_STEG.map(([, f]) => `<span style="background:${f}"></span>`).join('')}</span> 1 · 2–3 · 4–10 · 11–30 · 31–100 · fler</div>`
    : `<div class="forklaring">Mot mitt snitt: <span class="skala">${DIFF_STEG.map(([, f]) => `<span style="background:${f}"></span>`).join('')}</span> sämre ← ± → bättre (justerat, så länder med få filmer hamnar nära mitten)</div>`;
  app.innerHTML = `
    <h1>Länder</h1><p class="muted">Produktionsland enligt TMDB. En film kan ha flera länder.</p>
    <div class="filter"><span class="knappar"><button data-v="antal" class="${lage === 'antal' ? 'aktiv' : ''}">Antal filmer</button><button data-v="betyg" class="${lage === 'betyg' ? 'aktiv' : ''}">Betyg</button></span></div>
    <div class="kort">${karta}${forkl}</div>
    <h2>Tabell</h2>
    ${tabell(rader.map((r) => ({ ...r, namn: landNamn(r.land) })), [
      { nyckel: 'namn', rubrik: 'Land' },
      { nyckel: 'antal', rubrik: 'Filmer', num: true, html: (r) => fmt(r.antal) },
      { nyckel: 'snittbetyg', rubrik: 'Snitt', num: true, html: (r) => fmt(r.snittbetyg, 2) },
      { nyckel: 'maxbetyg', rubrik: 'Max', num: true, html: (r) => fmt(r.maxbetyg, 1) },
      { nyckel: 'minbetyg', rubrik: 'Min', num: true, html: (r) => fmt(r.minbetyg, 1) },
      { nyckel: 'diff_mot_ditt_snitt', rubrik: 'Mot mitt snitt', html: (r) => diffStapel(r.diff_mot_ditt_snitt) },
    ], { sort: 'antal', klick: (r) => filmerForLand(r.land) })}`;
  app.querySelectorAll('.knappar button').forEach((b) => { b.onclick = () => { satt('visa', b.dataset.v); visa(); }; });
  kopplaTips(app);
}

async function filmer() {
  const sok = params().get('sok') || '';
  const alla = await allaRader(`v_film?${V()}&select=film_id,titel,originaltitel,ar,betyg,tmdb_betyg_5,diff_mot_tmdb,datum,typ,tmdb_id,letterboxd_uri&order=film_id`);
  // Filmer markerade som sedda i Letterboxd men utan dagboksinlägg (läget vid senaste exporten)
  let saknas = [];
  try { saknas = await api(`v_utan_dagbok?${V()}&select=titel,ar,betyg,letterboxd_uri&order=titel`); } catch { /* vyn saknas ännu */ }
  const saknasHtml = saknas.length ? `<details class="kort" style="margin:.5rem 0 1rem"><summary>Saknar dagbok i Letterboxd (${fmt(saknas.length)})</summary>
      <p class="muted">Sedda eller betygsatta utan dagboksinlägg, enligt senaste exporten. Öppna filmen i Letterboxd och logga den med datum.</p>
      <ul class="lista-filmer">${saknas.map((f) => `<li>${f.betyg != null ? `${stjarnor(f.betyg)} ` : ''}<a href="${esc(f.letterboxd_uri)}" target="_blank" rel="noopener">${esc(f.titel)}</a> <span class="muted">${f.ar ?? ''}</span></li>`).join('')}</ul></details>` : '';
  const q = sok.toLowerCase();
  const rader = q ? alla.filter((f) => `${f.titel} ${f.originaltitel}`.toLowerCase().includes(q)) : alla;
  app.innerHTML = `
    <h1>Filmer</h1>
    ${saknasHtml}
    <div class="filter"><label>Sök <input id="f-sok" type="search" value="${esc(sok)}" placeholder="titel"></label><span class="muted">${fmt(rader.length)} av ${fmt(alla.length)}</span></div>
    ${tabell(rader, [
      { nyckel: 'titel', rubrik: 'Titel', html: (f) => `<a href="${tmdbUrl(f.typ, f.tmdb_id)}" target="_blank" rel="noopener">${esc(f.titel)}</a>${f.originaltitel && f.originaltitel !== f.titel ? ` <span class="muted">${esc(f.originaltitel)}</span>` : ''}${f.typ === 'serie' ? ' <span class="muted">(serie)</span>' : ''}` },
      { nyckel: 'ar', rubrik: 'År', num: true, html: (f) => f.ar ?? '–' },
      { nyckel: 'betyg', rubrik: 'Mitt betyg', html: (f) => f.letterboxd_uri ? `<a href="${esc(f.letterboxd_uri)}" target="_blank" rel="noopener" style="text-decoration:none">${stjarnor(f.betyg)}</a>` : stjarnor(f.betyg) },
      { nyckel: 'tmdb_betyg_5', rubrik: 'TMDB', num: true, html: (f) => fmt(f.tmdb_betyg_5, 1) },
      { nyckel: 'diff_mot_tmdb', rubrik: 'Mot TMDB', html: (f) => diffStapel(f.diff_mot_tmdb == null ? null : Number(f.diff_mot_tmdb), 2) },
      { nyckel: 'datum', rubrik: 'Betygsatt', html: (f) => f.datum ?? '–' },
    ], { sort: 'datum' })}`;
  let t; const inp = document.getElementById('f-sok');
  inp.oninput = (e) => { clearTimeout(t); t = setTimeout(() => { satt('sok', e.target.value.trim()); visa().then(() => { const i = document.getElementById('f-sok'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 350); };
}

function inloggning(fel = '') {
  document.querySelector('.tabs').hidden = true; document.querySelector('.vem').hidden = true; document.getElementById('loggaut').hidden = true;
  app.innerHTML = `<form class="login" id="login"><h1>Filmstatistik</h1><label for="kod">Kod</label>
    <input id="kod" type="password" autocomplete="current-password" required autofocus>
    <button class="prim" type="submit">Logga in</button>${fel ? `<p class="fel">${esc(fel)}</p>` : ''}</form>`;
  document.getElementById('login').onsubmit = async (e) => {
    e.preventDefault();
    const ok = await login(document.getElementById('kod').value);
    if (ok) visa(); else inloggning('Fel kod.');
  };
}

const SIDOR = { '': oversikt, personer, genrer, bolag, lander, filmer };
let visarNr = 0;
async function visa() {
  const route = (location.hash.replace(/^#\/?/, '').split('?')[0]) || '';
  if (route === 'logga-ut') { logout(); history.replaceState(null, '', '#/'); }
  if (!inloggad()) return inloggning();
  document.querySelector('.tabs').hidden = false; document.getElementById('loggaut').hidden = false;
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('aktiv', a.dataset.route === route));
  const nr = ++visarNr;
  try {
    if (!vemSel.options.length) await laddaAnvandare();
    const sida = SIDOR[route] ?? oversikt;
    if (!app.firstElementChild || app.dataset.route !== route) app.innerHTML = '<p class="muted center">Laddar …</p>';
    app.dataset.route = route;
    await sida();
    if (nr !== visarNr) return;
  } catch (err) {
    if (err.status === 401) return inloggning('Logga in igen.');
    app.innerHTML = `<p class="fel">Kunde inte hämta data: ${esc(err.message)}</p>`;
  }
}
window.addEventListener('hashchange', () => visa());
document.getElementById('version').textContent = `v${VERSION}`;
visa();
