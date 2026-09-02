# Buddy Budget — werkafspraken voor Claude

## Persoonlijke data: nooit in de repo

Dit is een privé-budgetapp. **Vóór elke commit, elk document, elke screenshot en elke testdataset controleer je dat er níets in zit dat de gebruiker zelf heeft ingevuld**: geen bedragen, geen inkomens, geen saldo's, geen namen van categorieën, rekeningen, banken, fondsen of tickers die uit de echte app komen, geen exportbestanden, geen back-ups.

- Testdata is altijd **fictief en generiek** (bv. "Boodschappen", "Bank A", ronde bedragen) en wordt in de scratchpad opgeslagen, niet in de repo.
- Screenshots komen alleen uit een sessie met fictieve seed-data.
- Voorbeeldwaarden in placeholders en documentatie zijn verzonnen, niet afgeleid van echte data.
- Als je een back-up of exportbestand van de gebruiker tegenkomt: niet lezen, niet citeren, niet commiten.
- Twijfel je of iets persoonlijk is: behandel het als persoonlijk.

## Architectuur

- Eén bestand: `index.html` (CSS, markup en JavaScript inline). Houd dat zo tenzij de gebruiker expliciet om een opsplitsing vraagt.
- Alle data staat in `localStorage` (`buddy-budget-v5`, of versleuteld in `buddy-budget-vault-v1`). Geen server, geen externe API's, geen koersen ophalen. De enige externe resource is Chart.js via jsDelivr, met SRI-hash.
- Bewaar de Content-Security-Policy strikt: geen `unsafe-eval`, geen extra `connect-src`.
- Wijzigingen aan het datamodel moeten achterwaarts compatibel zijn met bestaande opgeslagen data; migreer in `hydrateState()` en bewaak dat een migratie maar één keer loopt (schema-vlag).
- De versleutelde opslag gebruikt blob-formaat v2 (header met iteratiegetal); oude blobs blijven leesbaar. Verander het formaat nooit zonder migratiepad en test.
- `S.transactions` en `S.monthlyData` zijn twee representaties van dezelfde uitgaven en moeten samen gewijzigd worden.
- `S.fixedPayments` staat daar los van: betalingen afgeboekt op een vaste kost. Ze vullen het "vat" van die kost over zijn eigen periode (maand, kwartaal of kalenderjaar) en mogen nooit meetellen in `getMonthSpent()` of in de maandbudgetten — dat geld is al voorzien via de vaste kosten. Bewust één enkele lijst zonder maandtotalen-spiegel.
- Een vat is opt-in per post via `item.track` (standaard uit). Bedoeld voor kosten die je zelf onregelmatig betaalt (reizen, onderhoud, studie), niet voor domiciliëringen. Alleen posten met `track` staan in de afboeklijst; een post met `track` uit maar met betalingen in het lopende venster houdt zijn vat zichtbaar, zodat geld nooit uit beeld verdwijnt.

## Conventies

- Taal van de UI en van commentaar: Nederlands (België). Maandnamen in lopende zinnen met kleine letter.
- Bedragen via `fmt()`; komma als decimaalteken in invoervelden (`parseDec`, `inputDec`).
- Kleur betekent iets: groen/rood/oranje alleen voor financiële waarheid, accentkleur alleen voor interactie.
- Geen nieuwe externe afhankelijkheden. Lettertypes zitten als data-URI in het bestand: IBM Plex Mono voor alle bediening, titels en cijfers (console-karakter), Plus Jakarta Sans enkel voor lopende zinnen, Gabarito enkel voor het woordmerk. Nooit via Google Fonts of een andere externe host laden.

## Werkwijze

- Lees eerst hoe de betreffende sectie werkt (de `// === ... ===`-koppen) voor je iets wijzigt.
- Draai `npm test` na elke wijziging (Playwright, headless Chromium, fictieve data uit `tests/fixtures/seed.js`). Voeg voor nieuwe rekenlogica een test toe in `tests/run.js`.
- Controleer visueel met screenshots op telefoonformaat, altijd met de fictieve seed, nooit met echte data.
- Commit met een duidelijke Nederlandse of Engelse boodschap; geen modelnaam in commits of code.
