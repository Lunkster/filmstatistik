// Minimal zip-läsare i webbläsaren (metod 0 = lagrad, 8 = deflate). Inget bibliotek behövs.
const u16 = (d, o) => d.getUint16(o, true);
const u32 = (d, o) => d.getUint32(o, true);

export async function lasZip(buf) {
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (u32(dv, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Filen är ingen zip-fil.');
  const antal = u16(dv, eocd + 10);
  let p = u32(dv, eocd + 16);
  const dec = new TextDecoder('utf-8');
  const poster = [];
  for (let i = 0; i < antal; i++) {
    if (u32(dv, p) !== 0x02014b50) throw new Error('Zip-filen är skadad.');
    const metod = u16(dv, p + 10), csize = u32(dv, p + 20);
    const nl = u16(dv, p + 28), el = u16(dv, p + 30), cl = u16(dv, p + 32), lo = u32(dv, p + 42);
    const namn = dec.decode(new Uint8Array(buf, p + 46, nl));
    poster.push({ namn, metod, csize, lo });
    p += 46 + nl + el + cl;
  }
  return {
    namn: poster.map((x) => x.namn),
    async text(namn) {
      const x = poster.find((q) => q.namn === namn);
      if (!x) return null;
      const nl = u16(dv, x.lo + 26), el = u16(dv, x.lo + 28);
      const data = new Uint8Array(buf, x.lo + 30 + nl + el, x.csize);
      if (x.metod === 0) return dec.decode(data);
      if (x.metod !== 8) throw new Error('Zip-filen använder en komprimering som inte stöds.');
      const ut = new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')));
      return dec.decode(await ut.arrayBuffer());
    },
  };
}
