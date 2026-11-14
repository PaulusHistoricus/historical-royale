# Historical Royale — prototype 0.2

Een historische, kaartgestuurde **2D lane-battler** met een **liggend zijaanzicht**, geïnspireerd op de leesbaarheid van Age of War en de snelle kaartgevechten van Clash Royale.

## Spelen

Vereist Node.js 20.19+ of 22.12+.

```bash
npm install
npm run dev
```

Open de lokale URL van Vite. Voor een productiebuild: `npm run build`.

## Prototype 0.2

- **Landscape-arena met twee horizontale banen**: je kasteel links, vijandelijk kasteel rechts.
- **Eén toren per baan per speler**. Na vernietiging van de vijandelijke toren marcheren eenheden van die baan richting het gezamenlijke vijandelijke kasteel.
- Eenheden uit beide banen kunnen bij de kasteelaanval samenkomen.
- Selecteer onderaan Legionair (3 energie), Boogschutter (4) of Kanon (6) en klik links op een baan om de eenheid te plaatsen.
- Automatisch lopen, doelen zoeken, aanvallen, projectieleffecten en levensbalken.
- Eenvoudige computergestuurde tegenstander; wedstrijd van maximaal vier minuten.
- Energie vult zichzelf aan; in de laatste minuut sneller.
- Herstart na de wedstrijd via de knop, of met R.

## Belangrijke beperkingen

Dit is **nog geen online multiplayer** en de graphics zijn tijdelijke vormen, **geen definitieve 16-bit pixelart**. De visuele referentie is de kleurrijke historische zijaanzicht-arena met grote soldaten en twee banen. De animaties en echte sprite-assets volgen later.

De AI, gevechtsbalans en routekeuze zijn voorlopig. Bij de eerste praktijktest moeten vooral het samensmelten van de fronten, de torenprioriteit en het speltempo worden beoordeeld.

## Techniek

Phaser 3, JavaScript en Vite. De simulatie draait voorlopig lokaal in de browser. Voor eerlijke online PvP komt later een server-authoritative simulatie.

## Volgende stappen

1. De game op desktop en telefoon in landscape testen en gameplaybugs oplossen.
2. 16-bit spritesheets maken: idle, lopen, aanvallen en sterven.
3. Kaarten, energie, vijandelijke AI en routegedrag verder balanceren.
4. Realtime multiplayer en matchmaking toevoegen.

Dit project staat los van Relic Slide, Timeless en Ambulo.
