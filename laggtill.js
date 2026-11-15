// Lägg till på gemensam önskelista utifrån: klistra in/dela en länk (Letterboxd, boxd.it, IMDb, TMDB) eller sök på titel.
// Uppslagen görs i databasen (film.las_lank, film.sok_tmdb) så att TMDB-nyckeln aldrig lämnar Supabase.
import { rpc, glomCache, esc } from './lib.js';

const BILD = 'https://image.tmdb.org/t/p/w154';
const APP = 'https://lunkster.github.io/filmstatistik/';
const BOKMARKE = `javascript:location.href='${APP}?url='+encodeURIComponent(location.href)`;

export async function renderLaggTill(app, { vem, params }) {
  const start = params().get('q') || '';
  app.innerHTML = `
    <p><a href="#/onskelista">← Önskelista</a></p>
    <h1>Lägg till</h1>
    <p class="muted">Klistra in en länk från Letterboxd, IMDb eller TMDB, eller skriv en titel. Filmen läggs på er gemensamma önskelista och får en egen sida här.</p>
    <form id="lt-form" class="filter"><input id="lt-q" type="search" value="${esc(start)}" placeholder="länk eller titel" style="flex:1;min-width:14rem" autocomplete="off"><button class="prim" type="submit">Hämta</button></form>
    <div id="lt-res" aria-live="polite"></div>
    <details class="kort" style="margin-top:1.5rem"><summary>Lägga till direkt från Letterboxd, IMDb eller webbläsaren</summary>
      <h2>Android</h2>
      <p>Installera appen från Chrome (meny → Installera app). Sedan finns <b>Film</b> i delningsmenyn: tryck Dela på en film i Letterboxd- eller IMDb-appen eller på en webbsida och välj Film.</p>
      <h2>iPhone och iPad</h2>
      <ol>
        <li>Öppna appen <b>Genvägar</b> och tryck <b>+</b> för en ny genväg.</li>
        <li>Tryck på <b>ⓘ</b> längst ner och slå på <b>Visa i delningsmeny</b>. Välj att den tar emot <b>URL:er</b> och <b>Text</b>.</li>
        <li>Lägg till åtgärden <b>URL-koda</b> med <b>Genvägsindata</b>.</li>
        <li>Lägg till åtgärden <b>Öppna URL:er</b> och skriv adressen nedan, följd av variabeln <b>URL-kodad text</b>:
          <pre><code>${APP}?url=</code></pre></li>
        <li>Döp genvägen till <b>Film</b>. Tryck sedan Dela på en film i Letterboxd- eller IMDb-appen och välj Film.</li>
      </ol>
      <p class="muted">Genvägen öppnar sidan i Safari, inte i hemskärmsappen. Logga in i Safari en gång, så sparas inloggningen där.</p>
      <h2>Dator</h2>
      <p>Skapa ett bokmärke med adressen nedan. Klicka på bokmärket när du står på en film hos Letterboxd, IMDb eller TMDB.</p>
      <pre><code id="lt-bok">${esc(BOKMARKE)}</code></pre>
    </details>`;
  const form = document.getElementById('lt-form'), inp = document.getElementById('lt-q'), res = document.getElementById('lt-res');
  const kort = (t) => `
    <div class="kort lt-kort">
      ${t.affisch ? `<img src="${BILD}${esc(t.affisch)}" alt="" loading="lazy">` : '<div class="lt-tom"></div>'}
      <div>
        <h2 style="margin-top:0">${t.film_id ? `<a href="#/film/${t.film_id}">${esc(t.titel)}</a>` : esc(t.titel)} <span class="muted">${t.ar ?? ''}${t.typ === 'serie' ? ' · serie' : ''}</span></h2>
        ${t.originaltitel && t.originaltitel !== t.titel ? `<p class="muted">${esc(t.originaltitel)}</p>` : ''}
        ${t.beskrivning ? `<p class="lt-text">${esc(t.beskrivning)}</p>` : ''}
        <div class="knappar-rad">${t.gemensam ? '<span class="bock">✓ På er gemensamma önskelista</span>'
          : `<button class="prim" data-t='${esc(JSON.stringify(t))}'>Lägg till på gemensam önskelista</button>`}
          <a class="knapp" href="https://www.themoviedb.org/${t.typ === 'serie' ? 'tv' : 'movie'}/${t.tmdb_id}" target="_blank" rel="noopener">TMDB</a></div>
      </div>
    </div>`;
  const hamta = async () => {
    const q = inp.value.trim(); if (!q) return;
    res.innerHTML = '<p class="muted">Söker …</p>';
    try {
      const s = await rpc('las_lank', { _text: q });
      if (s.fel) res.innerHTML = `<p class="fel">${esc(s.fel)}.</p>`;
      else if (s.traff) res.innerHTML = kort(s.traff);
      else res.innerHTML = s.sok?.length ? s.sok.map(kort).join('') : '<p class="muted">Inga träffar.</p>';
    } catch (e) { res.innerHTML = `<p class="fel">${esc(e.message)}</p>`; }
  };
  form.onsubmit = (e) => { e.preventDefault(); history.replaceState(null, '', `#/lagg-till?q=${encodeURIComponent(inp.value.trim())}`); hamta(); };
  res.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-t]'); if (!b) return;
    const t = JSON.parse(b.dataset.t); b.disabled = true; b.textContent = 'Lägger till …';
    try {
      await rpc('satt_gemensam', { _letterboxd_uri: t.letterboxd_uri ?? null, _tmdb_id: t.tmdb_id, _typ: t.typ, _titel: t.titel, _ar: t.ar ?? null, _vem: vem(), _aktiv: true });
      glomCache();
      b.outerHTML = '<span class="bock">✓ Tillagd. Filmfakta hämtas från TMDB inom några minuter.</span>';
    } catch (err) { b.disabled = false; b.textContent = 'Lägg till på gemensam önskelista'; b.insertAdjacentHTML('afterend', `<span class="fel">${esc(err.message)}</span>`); }
  });
  if (start) hamta(); else inp.focus();
}

// Delning till appen (Android share_target, iOS-genväg, bokmärke) kommer som ?url=…&text=…&title=…
export function tagEmotDelning() {
  const s = new URLSearchParams(location.search);
  const q = [s.get('url'), s.get('text'), s.get('title')].filter(Boolean).join(' ').trim();
  if (!q) return;
  history.replaceState(null, '', `${location.pathname}#/lagg-till?q=${encodeURIComponent(q)}`);
}
