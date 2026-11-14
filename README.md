# Historical Royale

Een eerste, zelfstandige **Phaser 3**-demo: een verticale 3-banen-arena, geïnspireerd door de camera en snelle kaartgevechten van Clash Royale. **Geen nederzettingen en geen bouwsysteem.**

## Spelen

Vereist Node.js 20.19+ of 22.12+.

```bash
npm install
npm run dev
```

Open de lokale link die Vite toont. `npm run build` bouwt de productieversie.

Selecteer onderaan Legionair (3 energie), Boogschutter (4) of Kanon (6), en klik op je helft van een van de drie banen. De tegenstander plaatst automatisch troepen. De eenheden volgen hun baan, vechten automatisch en proberen torens en uiteindelijk de nexus te vernietigen. Een wedstrijd duurt maximaal vier minuten.

## Techniek en status

- Frontend: Phaser 3 / JavaScript / Vite.
- **Dit is een lokale singleplayer-proefversie tegen eenvoudige AI, nog geen online multiplayer.**
- De eenheden worden voorlopig uit eenvoudige vormen getekend. De volgende grafische stap is 16-bit pixelart-spritesheets met idle-, loop- en aanvalsanimaties.
- Simulatie draait nu in de browser; voor eerlijke online PvP komt later een server-authoritative gevechtssimulatie.
- Regels en balans zijn voorlopige ontwerpkeuzes, geen definitieve gamebalans.

## Volgende stappen

1. Testen van het speelgevoel op desktop en mobiel.
2. Bewegings- en aanvalsanimaties, geluid en eigen historische spritesheets.
3. Verbeterde targeting, balans en kaartrotatie.
4. Realtime multiplayer, synchronisatie en matchmaking.

Dit project staat los van Relic Slide, Timeless en Ambulo.
