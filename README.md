# Filmstatistik

Statistik över mina (och dotterns) filmbetyg: vilka regissörer, skådespelare, genrer, bolag och länder vi gillar mest och minst.

- **Betyg:** Letterboxd (gamla betyg från Filmtipset), serier från TMDB.
- **Filmfakta:** [TMDB](https://www.themoviedb.org/) – *This product uses the TMDB API but is not endorsed or certified by TMDB.*
- **Databas:** Supabase, schemat `film`. Sidan läser bara – all statistik räknas i databasens vyer.
- **Inloggning:** en gemensam kod (delat Supabase-konto med rollen `film`).
- **Värd:** GitHub Pages, statiska filer utan byggsteg.

Världskartan (`karta.json`) är förberäknade SVG-banor från [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth, public domain).
