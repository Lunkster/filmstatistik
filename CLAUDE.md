# Instruktioner för Claude – Filmstatistik

- Läs först Obsidian `Projekt/Film och serier/Film och serier - Projektdokument.md` (tågordning, logg) och `Film och serier - Datamodell.md`.
- Följ skillen `obsidian-projekt`: logga i projektanteckningen, temporära filer i `~/Dokument/Claude/Filmstatistik/`, aldrig i Obsidian.
- Databasen är schemat `film` i Supabase-projektet `nlvgisjssbjethumvgdz` (samma som THT). Schemat måste vara exponerat i Data API (Settings → Data API → Exposed schemas).
- Läsrätt: bara konton med `app_metadata.roll` = `film` eller `admin` (`film.ar_lasare()`). Det delade kontot är `h.lundqvist+film@gmail.com`; koden ligger i lösenordshanteraren.
- `s_person` läser den materialiserade vyn `mv_person`, som uppdateras av `film.uppdatera_statistik()` (cron `film-tmdb-ko`).
- Supabase-kopplingens bekräftelsefråga för borttagningar visas inte för Henrik – undvik `delete`/`drop` via kopplingen; ge Henrik SQL att köra i SQL Editor i stället.
- Inga personuppgifter, dumpar eller nycklar (utom publishable key) i repot.
- Format: 24-timmarsklocka, ÅÅÅÅ-MM-DD, `toLocaleString('sv-SE')` – oberoende av webbläsarens språk.
