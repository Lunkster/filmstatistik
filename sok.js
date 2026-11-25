// Sök i hela databasen: filmer och serier (alla, även från önskelistor och tips), personer och bolag.
// Hittas inget kan sökningen skickas vidare till Lägg till (TMDB).
import { api, rpc, esc, fmt, enc } from './lib.js';

const AFFISCH = 'https://image.tmdb.org/t/p/w92';
const PORTRATT = 'https://image.tmdb.org/t/p/w45';
const ROLLNAMN = { regi: 'regi', 'skådespelare': 'skådespelare', manus: 'manus', 'förlaga': 'förlaga', producent: 'producent',
  'exekutiv producent': 'exekutiv producent', foto: 'foto', musik: 'musik', klipp: 'klipp' };
const ROLLORDNING = Object.keys(ROLLNAMN);
// PostgREST-filter: tecken som har betydelse i or=(...) och ilike tas bort
const tvatta = (q) => q.replace(/[*,()"\\:]/g, ' ').replace(/\s+/g, ' ').trim();
const monster = (q) => `*${q.replace(/ /g, '*')}*`;

export async function renderSok(app, { params, satt, stjarnor }) {
  const start = params().get('q') || '';
  app.innerHTML = `
    <h1>Sök</h1>
    <form id="s-form" class="filter" role="search"><input id="s-q" type="search" value="${esc(start)}" placeholder="film, serie, person eller bolag" style="flex:1;min-width:14rem" autocomplete="off" enterkeyhint="search"></form>
    <div id="s-res" aria-live="polite"></div>`;
  const inp = document.getElementById('s-q'), res = document.getElementById('s-res');
  let nr = 0, t;
  const sok = async () => {
    const q = tvatta(inp.value);
    satt('q', inp.value.trim());
    const mitt = ++nr;
    if (q.length < 2) { res.innerHTML = q ? '<p class="muted">Skriv minst två tecken.</p>' : ''; return; }
    res.innerHTML = '<p class="muted">Söker …</p>';
    try {
      const html = await resultat(q, stjarnor);
      if (mitt === nr) res.innerHTML = html;
    } catch (e) { if (mitt === nr) res.innerHTML = `<p class="fel">${esc(e.message)}</p>`; }
  };
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(sok, 300); });
  document.getElementById('s-form').onsubmit = (e) => { e.preventDefault(); clearTimeout(t); sok(); inp.blur(); };
  res.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-pid]'); if (!b) return;
    const li = b.closest('li'), oppen = li.querySelector('.topp-filmer');
    if (oppen) { oppen.remove(); b.setAttribute('aria-expanded', 'false'); return; }
    const d = document.createElement('div'); d.className = 'topp-filmer'; d.innerHTML = '<span class="muted">Laddar …</span>';
    li.append(d); b.setAttribute('aria-expanded', 'true');
    try { d.innerHTML = await personensFilmer(b.dataset.pid, stjarnor); } catch (err) { d.innerHTML = `<span class="fel">${esc(err.message)}</span>`; }
  });
  if (start) sok(); else inp.focus();
}

async function resultat(q, stjarnor) {
  const m = enc(monster(q));
  const [filmer, personer, bolag] = await Promise.all([
    api(`film?or=(titel.ilike.${m},originaltitel.ilike.${m})&select=id,titel,originaltitel,ar,typ,affisch,popularitet&order=popularitet.desc.nullslast&limit=40`),
    rpc('sok_personer', { _q: q }),
    api(`bolag?namn=ilike.${m}&select=tmdb_id,namn,land&order=namn&limit=15`),
  ]);
  // Betyg för filmträffarna
  const betyg = filmer.length ? await api(`v_betyg?film_id=in.(${filmer.map((f) => f.id).join(',')})&select=film_id,anvandare,betyg&order=anvandare_id`) : [];
  const betygPer = new Map();
  betyg.forEach((b) => { if (!betygPer.has(b.film_id)) betygPer.set(b.film_id, []); betygPer.get(b.film_id).push(b); });
  // Titlar som börjar med söktexten först, sedan sedda filmer, sedan popularitet (ordningen från databasen)
  const borjar = (s) => (s ?? '').toLowerCase().startsWith(q.toLowerCase());
  filmer.forEach((f, i) => { f.rang = (borjar(f.titel) || borjar(f.originaltitel) ? 0 : 2) + (betygPer.has(f.id) ? 0 : 1) + i / 1000; });
  filmer.sort((a, b) => a.rang - b.rang);
  // Personer kommer sorterade från film.sok_personer: namn som börjar med söktexten, sedan flest filmer
  const pers = personer.map((p) => ({ ...p, roller: new Map(Object.entries(p.roller ?? {})) }));

  const filmHtml = filmer.length ? `<h2>Filmer och serier <span class="muted">(${fmt(filmer.length)}${filmer.length === 40 ? '+' : ''})</span></h2>
    <ul class="sok-lista">${filmer.map((f) => {
      const b = betygPer.get(f.id) ?? [];
      return `<li><a class="sok-rad" href="#/film/${f.id}">
        ${f.affisch ? `<img src="${AFFISCH}${esc(f.affisch)}" alt="" loading="lazy">` : '<span class="sok-tom"></span>'}
        <span><b>${esc(f.titel)}</b> <span class="muted">${f.ar ?? ''}${f.typ === 'serie' ? ' · serie' : ''}</span>
        ${f.originaltitel && f.originaltitel !== f.titel ? `<br><span class="muted">${esc(f.originaltitel)}</span>` : ''}
        <br>${b.length ? b.map((x) => `<span class="sok-betyg">${esc(x.anvandare)} ${stjarnor(x.betyg)}</span>`).join(' ') : '<span class="muted">Ingen av er har betygsatt den</span>'}</span>
      </a></li>`;
    }).join('')}</ul>` : '';
  const persHtml = pers.length ? `<h2>Personer</h2>
    <ul class="sok-lista personer">${pers.map((p) => {
      const r = [...p.roller.entries()].sort((a, b) => ROLLORDNING.indexOf(a[0]) - ROLLORDNING.indexOf(b[0]))
        .map(([roll, n]) => `${ROLLNAMN[roll] ?? roll} ${fmt(n)}`).join(' · ');
      return `<li><div class="sok-rad">
        ${p.bild ? `<img class="rund" src="${PORTRATT}${esc(p.bild)}" alt="" loading="lazy">` : '<span class="sok-tom rund"></span>'}
        <span><a href="https://www.themoviedb.org/person/${p.tmdb_id}" target="_blank" rel="noopener"><b>${esc(p.namn)}</b></a>
        <button class="lank" data-pid="${p.tmdb_id}" aria-expanded="false">${fmt(p.antal)} ${p.antal === 1 ? 'film' : 'filmer'}</button>
        <br><span class="muted">${esc(r)}</span></span></div></li>`;
    }).join('')}</ul>` : '';
  const bolagHtml = bolag.length ? `<h2>Bolag</h2>
    <ul class="lista-filmer">${bolag.map((b) => `<li><a href="#/bolag?min=1&sok=${enc(b.namn)}">${esc(b.namn)}</a>${b.land ? ` <span class="muted">${esc(b.land)}</span>` : ''}</li>`).join('')}</ul>` : '';
  const tmdb = `<p class="sok-tmdb"><a class="knapp" href="#/lagg-till?q=${enc(q)}">Sök på TMDB och lägg till på önskelistan →</a></p>`;
  if (!filmHtml && !persHtml && !bolagHtml) return `<p class="muted">Inga träffar i appen.</p>${tmdb}`;
  return `${filmHtml}${persHtml}${bolagHtml}${tmdb}`;
}

// Alla filmer en person är med i, oavsett roll, med era betyg
async function personensFilmer(pid, stjarnor) {
  const fp = await api(`film_person?person_id=eq.${pid}&select=film_id,roll,karaktar,ordning`);
  if (!fp.length) return '<span class="muted">Inga filmer.</span>';
  const ids = [...new Set(fp.map((x) => x.film_id))];
  const [filmer, betyg] = await Promise.all([
    api(`film?id=in.(${ids.join(',')})&select=id,titel,ar,typ&order=ar.desc.nullslast`),
    api(`v_betyg?film_id=in.(${ids.join(',')})&select=film_id,anvandare,betyg&order=anvandare_id`),
  ]);
  const roll = new Map();
  fp.forEach((x) => { const r = roll.get(x.film_id) ?? []; r.push(x.roll === 'skådespelare' && x.karaktar ? x.karaktar : ROLLNAMN[x.roll] ?? x.roll); roll.set(x.film_id, r); });
  const bet = new Map();
  betyg.forEach((b) => { if (!bet.has(b.film_id)) bet.set(b.film_id, []); bet.get(b.film_id).push(b); });
  return `<ul class="lista-filmer">${filmer.map((f) => `<li><a href="#/film/${f.id}">${esc(f.titel)}</a> <span class="muted">${f.ar ?? ''}${f.typ === 'serie' ? ' · serie' : ''} · ${esc([...new Set(roll.get(f.id))].join(', '))}</span>
    ${(bet.get(f.id) ?? []).map((b) => `<span class="sok-betyg">${esc(b.anvandare)} ${stjarnor(b.betyg)}</span>`).join(' ')}</li>`).join('')}</ul>`;
}
