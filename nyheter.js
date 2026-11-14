// Nytt i appen: korta punkter per dag från nyheter.json (versionen i slutet dämpas).
import { esc } from './lib.js';

const formatera = (t) => esc(t)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\s*\((v\d+\.\d+\.\d+(?:,\s*v\d+\.\d+\.\d+)*)\)\s*$/, ' <span class="muted">($1)</span>');

export async function renderNyheter(app, version) {
  const r = await fetch(`nyheter.json?v=${version}`, { cache: 'no-cache' });
  if (!r.ok) throw new Error('Kunde inte läsa nyheterna');
  const dagar = await r.json();
  app.innerHTML = `
    <h1>Nytt i appen</h1>
    <p class="muted">Vad som har tillkommit, dag för dag.</p>
    ${dagar.map((d) => `
      <section class="ny-dag">
        <h2>${esc(d.datum)}</h2>
        <ul class="ny-lista">${d.punkter.map((p) => `<li>${formatera(p)}</li>`).join('')}</ul>
      </section>`).join('')}`;
}
