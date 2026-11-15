// Önskelista: allas Letterboxd-watchlists sida vid sida och en gemensam lista som bockas i här.
// Inget sker automatiskt – markeringen "gemensam" görs för hand (tabellen film.gemensam).
import { api, rpc, glomCache, esc, fmt } from './lib.js';

export async function renderOnskelista(app, { vem, params, satt, visa }) {
  const [anv, rader, gem] = await Promise.all([
    api('anvandare?select=id,namn&order=id'),
    api('v_onskelista?select=anvandare_id,titel,ar,tillagd,letterboxd_uri,film_id,tmdb_id&order=titel'),
    api('v_gemensam?aktiv=is.true&select=id,letterboxd_uri,tmdb_id,typ,titel,ar,tillagd,tillagd_av,film_id&order=tillagd.desc', { fresh: true }),
  ]);
  const visaFilter = params().get('visa') || 'alla';
  // en rad per film (Letterboxd-adress)
  const filmer = new Map();
  rader.forEach((r) => {
    const f = filmer.get(r.letterboxd_uri) ?? { uri: r.letterboxd_uri, titel: r.titel, ar: r.ar, film_id: r.film_id, tmdb_id: r.tmdb_id, typ: 'film', vem: {} };
    f.vem[r.anvandare_id] = r.tillagd ?? true;
    filmer.set(r.letterboxd_uri, f);
  });
  const gemFor = (f) => gem.find((g) => (g.letterboxd_uri && g.letterboxd_uri === f.uri) || (g.tmdb_id && f.tmdb_id && g.tmdb_id === f.tmdb_id && g.typ === f.typ));
  // gemensamma som inte står på någon watchlist (tillagda på annat sätt)
  gem.forEach((g) => {
    if ([...filmer.values()].some((f) => gemFor(f) === g)) return;
    filmer.set(g.letterboxd_uri ?? `tmdb:${g.typ}:${g.tmdb_id}`, { uri: g.letterboxd_uri, titel: g.titel, ar: g.ar, tmdb_id: g.tmdb_id, typ: g.typ, film_id: g.film_id, vem: {} });
  });
  const lista = [...filmer.values()].map((f) => { const g = gemFor(f); return { ...f, film_id: f.film_id ?? g?.film_id, antal: Object.keys(f.vem).length, gem: !!g, gemInfo: g }; });
  lista.sort((a, b) => b.antal - a.antal || Number(b.gem) - Number(a.gem) || String(a.titel).localeCompare(String(b.titel), 'sv'));
  const synliga = lista.filter((f) => visaFilter === 'alla' || (visaFilter === 'bada' ? f.antal >= anv.length && anv.length > 1 : f.gem));
  const bada = lista.filter((f) => f.antal >= anv.length && anv.length > 1).length;

  const titelHtml = (f) => {
    const t = `${esc(f.titel ?? '(okänd titel)')}`;
    if (f.film_id) return `<a href="#/film/${f.film_id}">${t}</a>`;
    if (f.uri) return `<a href="${esc(f.uri)}" target="_blank" rel="noopener">${t}</a>`;
    if (f.tmdb_id) return `<a href="https://www.themoviedb.org/${f.typ === 'serie' ? 'tv' : 'movie'}/${f.tmdb_id}" target="_blank" rel="noopener">${t}</a>`;
    return t;
  };
  const bock = (v) => (v ? `<span class="bock" title="${v === true ? '' : `På listan sedan ${esc(v)}`}">✓</span>` : '<span class="muted">–</span>');
  app.innerHTML = `
    <h1>Önskelista</h1>
    <p class="muted">Era önskelistor (watchlists) i Letterboxd, som de såg ut vid senaste importen. Bocka i <b>Gemensam</b> för filmer ni vill se tillsammans. Filmer som ni båda har på listan står först.</p>
    <div class="tiles">
      ${anv.map((a) => `<div class="tile"><div class="v">${fmt(lista.filter((f) => f.vem[a.id]).length)}</div><div class="k">på ${esc(a.namn)}s lista</div></div>`).join('')}
      ${anv.length > 1 ? `<div class="tile"><div class="v">${fmt(bada)}</div><div class="k">på allas listor</div></div>` : ''}
      <div class="tile"><div class="v">${fmt(gem.length)}</div><div class="k">gemensamma</div></div>
    </div>
    <div class="filter"><span class="knappar">
      <button data-v="alla" class="${visaFilter === 'alla' ? 'aktiv' : ''}">Alla</button>
      ${anv.length > 1 ? `<button data-v="bada" class="${visaFilter === 'bada' ? 'aktiv' : ''}">På allas listor</button>` : ''}
      <button data-v="gemensam" class="${visaFilter === 'gemensam' ? 'aktiv' : ''}">Gemensamma</button>
    </span><span class="muted">${fmt(synliga.length)} filmer</span><a class="knapp prim" href="#/lagg-till">+ Lägg till utifrån</a></div>
    ${synliga.length ? `<div class="tabell-wrap"><table class="onske"><thead><tr><th>Film</th><th class="num">År</th>${anv.map((a) => `<th class="mitt">${esc(a.namn)}</th>`).join('')}<th class="mitt">Gemensam</th></tr></thead>
      <tbody>${synliga.map((f, i) => `<tr${f.antal >= anv.length && anv.length > 1 ? ' class="bada"' : ''}><td>${titelHtml(f)}</td><td class="num">${f.ar ?? ''}</td>${anv.map((a) => `<td class="mitt">${bock(f.vem[a.id])}</td>`).join('')}
        <td class="mitt"><input type="checkbox" data-i="${i}"${f.gem ? ' checked' : ''} aria-label="Gemensam: ${esc(f.titel)}" title="${f.gemInfo ? `Tillagd ${esc(String(f.gemInfo.tillagd).slice(0, 10))}${f.gemInfo.tillagd_av ? ` av ${esc(f.gemInfo.tillagd_av)}` : ''}` : 'Markera som gemensamt önskemål'}"></td></tr>`).join('')}</tbody></table></div>`
      : `<p class="muted">${rader.length ? 'Inga filmer med det filtret.' : 'Inga önskelistor importerade än. Importera Letterboxd-exporten under Importera, så kommer watchlist.csv med.'}</p>`}
    <p class="muted">Titlar utan egen sida här länkar till Letterboxd. TMDB-kopplingen för nya filmer på listorna görs i bakgrunden efter importen.</p>`;
  app.querySelectorAll('.knappar button').forEach((b) => { b.onclick = () => { satt('visa', b.dataset.v); visa(); }; });
  app.querySelector('table.onske')?.addEventListener('change', async (e) => {
    const cb = e.target.closest('input[type=checkbox][data-i]'); if (!cb) return;
    const f = synliga[cb.dataset.i]; cb.disabled = true;
    try {
      await rpc('satt_gemensam', { _letterboxd_uri: f.uri ?? null, _tmdb_id: f.tmdb_id ?? null, _typ: f.typ ?? 'film', _titel: f.titel ?? null, _ar: f.ar ?? null, _vem: vem(), _aktiv: cb.checked });
      glomCache(); f.gem = cb.checked;
    } catch (err) { cb.checked = !cb.checked; alertRad(cb, err.message); }
    cb.disabled = false;
  });
}
function alertRad(el, m) { const s = document.createElement('div'); s.className = 'fel'; s.textContent = m; el.closest('td').append(s); }
