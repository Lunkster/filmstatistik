// Filmsida: metadata från TMDB (sparad i film.*), allas betyg, visningar och önskelistor, länkar ut.
import { api, rpc, glomCache, esc, fmt, enc, arVar, strommas, LOGO } from './lib.js';

const BILD = 'https://image.tmdb.org/t/p/w342';
const HISTORISKA = { SU: 'Sovjetunionen', YU: 'Jugoslavien', AN: 'Nederländska Antillerna', CS: 'Tjeckoslovakien', DD: 'Östtyskland', XC: 'Tjeckoslovakien', XG: 'Östtyskland' };
const LAND = new Intl.DisplayNames('sv', { type: 'region' });
const SPRAK = new Intl.DisplayNames('sv', { type: 'language' });
const landNamn = (iso) => HISTORISKA[iso] ?? (() => { try { return LAND.of(iso); } catch { return iso; } })();
const sprakNamn = (k) => { try { return k ? SPRAK.of(k) : null; } catch { return k; } };
const ROLLER = [['regi', 'Regi'], ['manus', 'Manus'], ['förlaga', 'Förlaga'], ['producent', 'Producent'],
  ['exekutiv producent', 'Exekutiv producent'], ['foto', 'Foto'], ['musik', 'Musik'], ['klipp', 'Klipp']];
const slug = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const forsok = async (p) => { try { return await p; } catch { return []; } }; // vyer som kanske inte finns ännu
const timmar = (min) => (min ? `${Math.floor(min / 60)} h ${min % 60} min` : null);
const person = (p) => `<a href="https://www.themoviedb.org/person/${p.tmdb_id}" target="_blank" rel="noopener">${esc(p.namn)}</a>`;

export async function renderFilm(app, id, { stjarnor, vem }) {
  if (!/^\d+$/.test(id)) { app.innerHTML = '<p class="fel">Okänd film.</p>'; return; }
  const [[f], betyg, sedd, logg, lb, genrer, bolag, personer, ord, lander, onske] = await Promise.all([
    api(`film?id=eq.${id}&select=*`),
    api(`v_betyg?film_id=eq.${id}&select=anvandare,anvandare_id,betyg,datum&order=anvandare_id`),
    forsok(api(`v_film_sedd?film_id=eq.${id}&select=anvandare,sedd,ganger`)),
    forsok(api(`v_loggning?film_id=eq.${id}&select=anvandare,datum,betyg,omtitt,taggar&order=datum.desc`)),
    api(`betyg?film_id=eq.${id}&kalla=eq.letterboxd&aktiv=is.true&letterboxd_uri=not.is.null&select=letterboxd_uri&limit=1`),
    api(`film_genre?film_id=eq.${id}&select=genre(namn)`),
    api(`film_bolag?film_id=eq.${id}&select=bolag(tmdb_id,namn,land)`),
    api(`film_person?film_id=eq.${id}&select=roll,karaktar,ordning,person(tmdb_id,namn)&order=ordning`),
    api(`film_nyckelord?film_id=eq.${id}&select=nyckelord(namn)`),
    api(`v_film_land?film_id=eq.${id}&select=land`),
    forsok(api(`v_onskelista?film_id=eq.${id}&select=anvandare,tillagd`)),
  ]);
  const gem = f ? await forsok(api(`gemensam?aktiv=is.true&or=(and(typ.eq.${f.typ},tmdb_id.eq.${f.tmdb_id})${lb[0]?.letterboxd_uri ? `,letterboxd_uri.eq.${enc(`"${lb[0].letterboxd_uri}"`)}` : ''})&select=tillagd,tillagd_av&limit=1`, { fresh: true })) : [];
  if (!f) { app.innerHTML = '<p class="fel">Filmen finns inte.</p>'; return; }
  const serie = f.typ === 'serie';
  const tmdbTyp = serie ? 'tv' : 'movie';
  const lbUri = lb[0]?.letterboxd_uri ?? (serie ? null : `https://letterboxd.com/tmdb/${f.tmdb_id}/`);
  const lankar = [
    ['TMDB', `https://www.themoviedb.org/${tmdbTyp}/${f.tmdb_id}`],
    f.imdb_id ? ['IMDb', `https://www.imdb.com/title/${enc(f.imdb_id)}/`] : null,
    lbUri ? ['Letterboxd', lbUri] : null,
    ['JustWatch', `https://www.justwatch.com/se/search?q=${enc(f.titel)}`],
    ['WatchAny', `https://watchany.stream/${tmdbTyp}/${f.tmdb_id}-${slug(f.originaltitel || f.titel)}`],
  ].filter(Boolean);

  // allas betyg och visningar per person
  const sedda = new Map(sedd.map((s) => [s.anvandare, s]));
  const betygHtml = betyg.length ? `<table class="smal"><thead><tr><th>Vem</th><th>Betyg</th><th>Betygsatt</th><th>Senast sedd</th><th class="num">Gånger</th></tr></thead><tbody>${betyg.map((b) => {
    const s = sedda.get(b.anvandare);
    return `<tr><td>${esc(b.anvandare)}</td><td>${stjarnor(b.betyg == null ? null : Number(b.betyg))}</td><td>${b.datum ?? '–'}</td><td>${s?.sedd ?? '–'}</td><td class="num">${s?.ganger ? fmt(s.ganger) : '–'}</td></tr>`;
  }).join('')}</tbody></table>` : '<p class="muted">Ingen av oss har betygsatt den.</p>';

  const genreNamn = genrer.map((g) => g.genre?.namn).filter(Boolean);
  const fakta = [
    ['År', f.ar], ['Premiär', f.premiar], ['Längd', timmar(f.langd_min)], ['Originalspråk', sprakNamn(f.originalsprak)],
    ['Länder', lander.map((l) => esc(landNamn(l.land))).join(', ') || null], ['Samling', f.samling ? esc(f.samling) : null],
    ['TMDB', f.tmdb_betyg != null ? `${fmt(f.tmdb_betyg / 2, 1)} av 5 <span class="muted">(${fmt(f.tmdb_roster)} röster)</span>` : null],
    ['Budget', f.budget ? `${fmt(f.budget)} USD` : null], ['Intäkter', f.intakter ? `${fmt(f.intakter)} USD` : null],
  ].filter(([, v]) => v != null && v !== '');

  const crew = ROLLER.map(([roll, rubrik]) => {
    const p = personer.filter((x) => x.roll === roll && x.person);
    return p.length ? `<div><span class="muted">${rubrik}</span><br>${p.map((x) => person(x.person)).join(', ')}</div>` : '';
  }).join('');
  const cast = personer.filter((x) => x.roll === 'skådespelare' && x.person).sort((a, b) => (a.ordning ?? 999) - (b.ordning ?? 999));
  const castRad = (x) => `<li>${person(x.person)}${x.karaktar ? ` <span class="muted">${esc(x.karaktar)}</span>` : ''}</li>`;
  const castHtml = cast.length ? `<ul class="lista-filmer">${cast.slice(0, 16).map(castRad).join('')}</ul>${cast.length > 16
    ? `<details><summary>Alla ${fmt(cast.length)} i rollistan</summary><ul class="lista-filmer">${cast.slice(16).map(castRad).join('')}</ul></details>` : ''}` : '<p class="muted">Ingen rollista.</p>';

  app.innerHTML = `
    <p><a href="#/" class="tillbaka">← Tillbaka</a></p>
    <div class="film-topp">
      ${f.affisch ? `<img class="affisch" src="${BILD}${esc(f.affisch)}" alt="Affisch: ${esc(f.titel)}" loading="lazy">` : ''}
      <div class="film-info">
        <h1>${esc(f.titel)} <span class="muted">${f.ar ?? ''}</span></h1>
        ${f.originaltitel && f.originaltitel !== f.titel ? `<p class="muted">${esc(f.originaltitel)}</p>` : ''}
        ${serie ? '<p class="muted">Serie</p>' : ''}
        ${genreNamn.length ? `<p class="taggar">${genreNamn.map((g) => `<a class="tagg" href="#/genrer">${esc(g)}</a>`).join('')}</p>` : ''}
        ${f.beskrivning ? `<p>${esc(f.beskrivning)}</p>` : ''}
        <div id="tjanster" class="tjanster"><span class="muted">Kollar var filmen går att se …</span></div>
        <div class="knappar-rad">${lankar.map(([t, u]) => `<a class="knapp" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${t}</a>`).join('')}</div>
      </div>
    </div>
    <div class="rutnat" style="margin-top:1rem">
      <div class="kort"><h2>Våra betyg</h2>${betygHtml}
        <p><label class="gem-val"><input type="checkbox" id="gem"${gem.length ? ' checked' : ''}> På vår gemensamma önskelista</label>${gem[0] ? ` <span class="muted">sedan ${String(gem[0].tillagd).slice(0, 10)}${gem[0].tillagd_av ? ` (${esc(gem[0].tillagd_av)})` : ''}</span>` : ''}</p>
        ${onske.length ? `<p>På önskelistan hos ${onske.map((o) => `<b>${esc(o.anvandare)}</b>${o.tillagd ? ` <span class="muted">sedan ${o.tillagd}</span>` : ''}`).join(', ')}.</p>` : ''}
      </div>
      <div class="kort"><h2>Fakta</h2><dl class="fakta">${fakta.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>
    </div>
    ${logg.length ? `<h2>Visningar</h2><div class="tabell-wrap"><table><thead><tr><th>Datum</th><th>Vem</th><th>Betyg</th><th>Etiketter</th></tr></thead><tbody>${logg.map((l) => `<tr><td>${l.datum ?? '–'}${l.omtitt ? ' <span class="muted">omtitt</span>' : ''}</td><td>${esc(l.anvandare)}</td><td>${l.betyg != null ? stjarnor(Number(l.betyg)) : '–'}</td><td>${(l.taggar ?? []).map(esc).join(', ')}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${crew ? `<h2>Bakom kameran</h2><div class="kort crew">${crew}</div>` : ''}
    <h2>Rollista</h2><div class="kort">${castHtml}</div>
    ${bolag.length ? `<h2>${serie ? 'Bolag och kanaler' : 'Produktionsbolag'}</h2><div class="kort"><ul class="lista-filmer">${bolag.filter((b) => b.bolag).map(({ bolag: b }) => `<li><a href="#/bolag?min=1&sok=${enc(b.namn)}">${esc(b.namn)}</a>${b.land ? ` <span class="muted">${esc(landNamn(b.land))}</span>` : ''}</li>`).join('')}</ul></div>` : ''}
    ${ord.length ? `<h2>Nyckelord</h2><p class="taggar">${ord.map((o) => o.nyckelord?.namn).filter(Boolean).map((n) => `<span class="tagg">${esc(n)}</span>`).join('')}</p>` : ''}`;
  visaTjanster(app.querySelector('#tjanster'), id);
  const gemCb = app.querySelector('#gem');
  gemCb.addEventListener('change', async () => {
    gemCb.disabled = true;
    try {
      await rpc('satt_gemensam', { _letterboxd_uri: lb[0]?.letterboxd_uri ?? null, _tmdb_id: f.tmdb_id, _typ: f.typ, _titel: f.titel, _ar: f.ar, _vem: vem(), _aktiv: gemCb.checked });
      glomCache();
    } catch (e) { gemCb.checked = !gemCb.checked; gemCb.closest('p').insertAdjacentHTML('beforeend', `<span class="fel"> ${esc(e.message)}</span>`); }
    gemCb.disabled = false;
  });
  app.querySelector('.tillbaka').addEventListener('click', (e) => { if (history.length > 1) { e.preventDefault(); history.back(); } });
}

// Var filmen går att se i Sverige – hämtas efter att sidan ritats (kan ta någon sekund första gången)
async function visaTjanster(el, id) {
  try {
    const t = await rpc('tjanster', { _film_id: Number(id) });
    if (!el.isConnected) return;
    if (!t) { el.innerHTML = '<span class="muted">Kunde inte hämta var filmen går att se.</span>'; return; }
    const strom = strommas(t.data);
    const hyr = [...new Set((t.data ?? []).filter((x) => x.typ === 'rent' || x.typ === 'buy').map((x) => x.namn))];
    const logo = (x) => `<span class="tjanst${arVar(x.namn) ? ' var' : ''}" title="${esc(x.namn)}${x.typ === 'free' ? ' (gratis)' : x.typ === 'ads' ? ' (med reklam)' : ''}">${x.logo ? `<img src="${LOGO}${esc(x.logo)}" alt="">` : ''}${esc(x.namn)}${x.typ === 'free' ? ' <span class="muted">gratis</span>' : ''}</span>`;
    el.innerHTML = `${strom.length ? `<div class="tjanst-rad"><span class="muted">Strömma:</span> ${strom.map(logo).join('')}</div>` : '<div class="muted">Finns inte att strömma i Sverige just nu.</div>'}
      ${hyr.length ? `<div class="muted liten">Hyra eller köpa: ${hyr.map(esc).join(', ')}</div>` : ''}
      <div class="muted liten">${t.lank ? `<a href="${esc(t.lank)}" target="_blank" rel="noopener">Data från JustWatch</a>` : 'Data från JustWatch'} via TMDB, ${String(t.hamtad).slice(0, 10)}</div>`;
  } catch (e) { if (el.isConnected) el.innerHTML = `<span class="fel">${esc(e.message)}</span>`; }
}
