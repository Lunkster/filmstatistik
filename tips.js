// Tips: osedda filmer poängsatta efter era betyg på personer, genrer och liknande filmer (film.s_tips).
// Poängen räknas i databasen (mv_tips_poang) för Henrik, Tuva och Alla; Alla = ingen av er har sett den.
import { api, rpc, glomCache, esc, fmt, enc, arVar, strommas, LOGO, VARA_TJANSTER } from './lib.js';

const BILD = 'https://image.tmdb.org/t/p/w154';
const ROLL = { regi: 'regi', manus: 'manus', skådespelare: '', foto: 'foto', musik: 'musik' };

export async function renderTips(app, { vem, params, satt, visa }) {
  const p = params(), filt = p.get('visa') || 'alla', antal = Number(p.get('antal') || 30);
  const [tips, tj] = await Promise.all([
    api(`s_tips?anvandare=eq.${enc(vem())}&order=plats&limit=500&select=tmdb_id,titel,originaltitel,ar,affisch,beskrivning,tmdb_betyg,roster,poang,personpoang,genrepoang,rekpoang,tmdbpoang,personer,genrer,rek_fran,film_id,gemensam,onskelista`, { fresh: true }),
    api('film_tjanst?select=film_id,data&order=film_id&limit=5000'),
  ]);
  const tjMap = new Map(tj.map((t) => [t.film_id, strommas(t.data)]));
  tips.forEach((t) => { t.strom = t.film_id ? tjMap.get(t.film_id) ?? null : null; t.hosOss = (t.strom ?? []).some((x) => arVar(x.namn)); });
  const urval = tips.filter((t) => filt === 'alla' || (filt === 'strom' ? t.hosOss : (t.gemensam || t.onskelista?.length)));
  const alla = vem() === 'Alla';
  const varfor = (t) => {
    const pers = (t.personer ?? []).filter((x) => x.diff > 0).slice(0, 4).map((x) => `${esc(x.namn)}${ROLL[x.roll] ? ` <span class="muted">(${ROLL[x.roll]})</span>` : ''}`);
    const rek = (t.rek_fran ?? []).slice(0, 3).map((x) => (x.film_id ? `<a href="#/film/${x.film_id}">${esc(x.titel)}</a>` : esc(x.titel)));
    return [pers.length ? `Med ${pers.join(', ')}` : '', rek.length ? `Liknar ${rek.join(', ')}` : ''].filter(Boolean).join(' · ');
  };
  const kort = (t, i) => `
    <div class="kort tips-kort" data-i="${i}">
      ${t.affisch ? `<img src="${BILD}${esc(t.affisch)}" alt="" loading="lazy">` : '<div class="lt-tom"></div>'}
      <div class="tips-info">
        <h2>${t.film_id ? `<a href="#/film/${t.film_id}">${esc(t.titel)}</a>` : `<a href="https://www.themoviedb.org/movie/${t.tmdb_id}" target="_blank" rel="noopener">${esc(t.titel)}</a>`} <span class="muted">${t.ar ?? ''}</span></h2>
        <div class="tips-poang" title="Personer ${fmt(t.personpoang, 2)} · genrer ${fmt(t.genrepoang, 2)} · liknande ${fmt(t.rekpoang, 2)} · TMDB ${fmt(t.tmdbpoang, 2)}">
          <span class="stapel" style="width:${Math.max(4, Math.min(100, Math.round(t.poang * 45)))}px;background:var(--pos)"></span> ${fmt(t.poang, 2)}
          <span class="muted">· TMDB ${fmt(t.tmdb_betyg / 2, 1)} (${fmt(t.roster)})</span></div>
        <p class="liten">${varfor(t)}</p>
        ${(t.genrer ?? []).length ? `<p class="taggar">${t.genrer.slice(0, 4).map((g) => `<span class="tagg">${esc(g)}</span>`).join('')}</p>` : ''}
        ${t.strom?.length ? `<div class="tjanst-rad">${t.strom.slice(0, 5).map((x) => `<span class="tjanst${arVar(x.namn) ? ' var' : ''}" title="${esc(x.namn)}">${x.logo ? `<img src="${LOGO}${esc(x.logo)}" alt="">` : ''}${esc(x.namn)}</span>`).join('')}</div>` : ''}
        <div class="knappar-rad tips-knappar">
          ${t.gemensam ? '<span class="bock">✓ På gemensamma önskelistan</span>' : '<button class="prim" data-g>+ Gemensam önskelista</button>'}
          ${t.onskelista?.length ? `<span class="muted liten">På ${t.onskelista.map(esc).join(' och ')}s watchlist</span>` : ''}
          <button data-n title="Visa inte det här tipset igen för ${esc(vem())}">Inte intresserad</button>
        </div>
      </div>
    </div>`;
  app.innerHTML = `
    <h1>Tips</h1>
    <p class="muted">${alla ? 'Filmer som ingen av er har sett, men som ni båda borde gilla' : `Filmer ${esc(vem())} inte har sett men borde gilla`}: poäng för ${alla ? 'era' : ''} favoritregissörer, skådespelare och manusförfattare, genrer ${alla ? 'ni' : ''} gillar, likhet med ${alla ? 'era' : ''} högt betygsatta filmer och TMDB-betyget. Byt person i väljaren uppe till höger.</p>
    <div class="filter"><span class="knappar">
      <button data-v="alla" class="${filt === 'alla' ? 'aktiv' : ''}">Alla</button>
      <button data-v="strom" class="${filt === 'strom' ? 'aktiv' : ''}" title="${esc(VARA_TJANSTER.join(', '))}">Strömma</button>
      <button data-v="onske" class="${filt === 'onske' ? 'aktiv' : ''}">Önskelistor</button>
    </span><span class="muted">${fmt(urval.length)} tips</span></div>
    <div id="tips-lista">${urval.slice(0, antal).map((t) => kort(t, tips.indexOf(t))).join('') || `<p class="muted">${tips.length ? 'Inga tips med det filtret.' : 'Tipsen räknas fram i bakgrunden – titta in om en stund.'}</p>`}</div>
    ${urval.length > antal ? `<p><button id="fler">Visa fler</button></p>` : ''}
    <p class="muted liten">Strömningsuppgifter finns för de cirka 60 bästa tipsen (data från JustWatch via TMDB). Tipsen räknas om när nya betyg kommer in.</p>`;
  app.querySelectorAll('.filter .knappar button').forEach((b) => { b.onclick = () => { satt('visa', b.dataset.v); satt('antal', ''); visa(); }; });
  document.getElementById('fler')?.addEventListener('click', () => { satt('antal', String(antal + 30)); visa(); });
  document.getElementById('tips-lista').addEventListener('click', async (e) => {
    const k = e.target.closest('.tips-kort'); if (!k) return;
    const t = tips[k.dataset.i];
    if (e.target.closest('button[data-g]')) {
      const b = e.target.closest('button'); b.disabled = true;
      try { await rpc('satt_gemensam', { _letterboxd_uri: null, _tmdb_id: t.tmdb_id, _typ: 'film', _titel: t.titel, _ar: t.ar ?? null, _vem: vem(), _aktiv: true }); glomCache(); t.gemensam = true; b.outerHTML = '<span class="bock">✓ På gemensamma önskelistan</span>'; }
      catch (err) { b.disabled = false; b.insertAdjacentHTML('afterend', `<span class="fel">${esc(err.message)}</span>`); }
    } else if (e.target.closest('button[data-n]')) {
      const b = e.target.closest('button'); b.disabled = true;
      try { await rpc('avfarda_tips', { _anvandare: vem(), _tmdb_id: t.tmdb_id, _avfard: true }); glomCache(); k.remove(); }
      catch (err) { b.disabled = false; b.insertAdjacentHTML('afterend', `<span class="fel">${esc(err.message)}</span>`); }
    }
  });
}
