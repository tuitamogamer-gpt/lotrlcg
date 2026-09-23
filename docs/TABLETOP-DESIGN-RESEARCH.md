# LOTR LCG: istraživanje izgleda fizičke igre i frontend

Istraženo i implementirano lokalno 24. septembra 2026. Predmet je **The Lord of the Rings: The Card Game / LCG**, a ne Adventure Card Game, Decipher TCG ili druga LOTR društvena igra.

## Reference

| Izvor | Šta je pregledano | Primjena |
| --- | --- | --- |
| [FFG Core Set pravilnik](https://www.fantasyflightgames.com/ffg_content/lotr-lcg/LOTR%20Rules.pdf), str. 3, 5, 10–11 i 14 | Komponente, raspored prostora za igru, quest karte i položaj iscrpljenih karata | Odvojeni zajednički i lični prostori, quest u vodoravnom formatu, brojači i okretanje karata za 90° |
| [FFG Fellowship 1–4 Player Gamemat](https://www.fantasyflightgames.com/en/products/fantasy-flight-supply/products/fellowship-1-4-player-gamemat/) | Fotografija i opis službenog playmata | Neprekinuta tematska podloga, jasna mjesta za quest, aktivnu lokaciju, encounter špil i discard |
| [Geek Stuff: Lord of the Rings LCG](https://geekstuff.blog/2021/04/29/lord-of-the-rings-the-living-card-game/) · [fotografija partije](https://geekstuffbart.files.wordpress.com/2021/04/lotr-lcg-game-3.jpg?w=2048) | Stvarna partija na drvenom stolu: redovi karata, dodaci, poleđine špilova i threat brojači | Karte imaju glavnu vizuelnu ulogu; položaj karata prenosi stanje igre; dodaci ostaju uz svoje likove |
| [OnTableTop: Flies and Spiders](https://www.ontabletop.com/fantasy-flight-games/frees-lotr-lcg-solo-passage-through-mirkwood-flies-and-spiders/) | Pisani izvještaj solo partije i slijed pomjeranja karata, resursa, ranjavanja i iscrpljivanja | Pregled stola treba ostati moguć između odluka i događaja |
| [Hall of Beorn: Core Set](https://www.hallofbeorn.com/LotR/Products/Core-Set?View=Browse) · [Flies and Spiders](https://www.hallofbeorn.com/LotR/Details/Flies-and-Spiders-Core) | Originalni skenovi quest karata, uključujući obje završnice Mirkwooda | Lokalno keširano svih deset B strana koje odgovaraju postojećim scenarijima |

Fotografije su vizuelne reference, a pravilnik je izvor za značenje komponenti. Stvarni igrači raspoređuju sto prema prostoru i navikama; ne postoji jedan obavezan položaj svakog špila.

## Zaključak za dizajn

Prethodni frontend je koristio izrezane ilustracije u malim panelima. Time je bio izgubljen najprepoznatljiviji dio fizičke igre: cijela karta sa svojim okvirom, tekstom, uspravnim ili okrenutim položajem i žetonima na njoj.

Novi prikaz je pogled odozgo na tamnozelenu podlogu sa tihom kartografskom teksturom i drvenim rubom. Zelena je izbor ovog interfejsa, ne tvrdnja da igra zahtijeva takav playmat. Postojeći atlas i fontovi zadržani su radi kontinuiteta sa menijem avantura. Boje podloge su prigušene da originalni skenovi budu najistaknutiji elementi.

Raspored je prilagođen desktop ekranu:

- Lijevo su aktuelna quest karta, napredak i aktivna lokacija. Quest karta se otvara u velikom pregledu. Lokacija ostaje vizuelno odvojena od staging karata.
- Gornji red pripada encounter kartama. Engaged neprijatelji imaju odvojeno područje i oznaku vlasnika sukoba.
- Donji red prikazuje aktivnu družinu, dok su ostali heroji i njihovi saveznici vidljivi pored nje. Klik na drugi fellowship mijenja aktivni špil.
- Desno su encounter i player špilovi sa javnim brojevima karata, te pripadajući discard sa posljednjom odbačenom kartom. Klik na discard otvara odgovarajući pregled.
- Ruka je uz bliži rub stola. Cijele karte, sortiranje, filter i Play komanda ostaju dostupni.
- Komande za fazu su uz sto, zajedno sa threat brojačem sa dva točkića.

Resursi su zlatni žetoni, rane crveni, a napredak zeleni. Svaki žeton prikazuje stvarnu vrijednost iz enginea. Iscrpljeni likovi se okreću za 90°, a njihovi dodaci proviruju iza karte i mogu se zasebno pregledati. Shadow karte imaju zatvorene poleđine i prikazuju samo broj; identitet se ne otkriva prije engineovog događaja otkrivanja.

## Prilagođavanje digitalnom formatu

Cijeli tekst fizičke karte nije čitljiv u svakoj veličini prozora. Zato su zadržani veliki hover pregled, otvaranje kartice, žive statistike i eksplicitne komande. Prikaz pune karte koristi pravilan odnos stranica i ne izrezuje ilustraciju ili tekst.

Veličina karata prati visinu raspoloživog područja. Prepuni redovi imaju lokalno skrolovanje, dok ruka i glavna komanda ostaju dostupne. Niži laptop prozori prikazuju manje karte; veći monitori dobijaju veće skenove. Namjerno nema slobodnog pomjeranja karata ili ručnog mijenjanja žetona: postojeći engine i dalje određuje legalne akcije i stanje.

B strana questa prikazuje trenutnu fazu; buduće karte questa se ne otkrivaju. Poleđine špilova i brojač su originalni HTML/CSS elementi, a ne preuzeti zvanični grafički materijal. Fotografije stolova i slika službenog playmata korištene su samo za istraživanje. Autorska prava na skenove karata ostaju njihovim vlasnicima.

Implementacija: `src/ui/tabletop.tsx`, `src/ui/tabletop.css` i povezivanje u `src/App.tsx`. Podaci za pravila i save format nisu mijenjani u ovom zadatku.

## Provjera implementacije

- `npm run build`: TypeScript i produkcijski build prolaze. Postojeći Vite advisory o veličini glavnog bundlea ostaje.
- `DESKTOP_ONLY=1 npm run test:ui`: sortiranje/filter ruke, hover, igranje kroz inspector, dodaci, discard, prečice, preference i bezbjedan restart prolaze.
- `npm run test:hotseat`: odvojeni špilovi, puna runda, učitavanje, Sentinel/Ranged, zajednički dodaci, campaign carry-over i dostupnost komandi prolaze.
- `npm run test:pacing`: ručne potvrde, redoslijed encounter/shadow efekata, šteta, pregled stola, istorija i zaštita od preskakanja događaja prolaze.
- Posebna vizuelna provjera novog stola: 1280×720, 1440×900, 1920×1080, 2560×1440 i osnovni 390×844 prikaz bez horizontalnog prelijevanja stranice. Provjereni su oba discard taba, otvaranje questa i dodataka, zaštita prečica u dijalogu, nepromijenjeno stanje tokom pregleda, promjena heroja i nastavak nakon učitavanja. Svih deset quest slika se dekodira u horizontalnom formatu. Nema browser console/page grešaka.
- Pokrenut standardni `develop-web-game` Playwright klijent; pregledani screenshot i javni JSON stanja. Screenshotovi popunjenog stola i novi inspector su vizuelno pregledani.

Lokalni dokaz: `output/tabletop-research/verification.json`, `final-1280.png`, `final-1440.png`, `final-1920.png`, `final-2560.png` i `quest-inspector.png`. `output/` se ne objavljuje kroz Git. Dalji mobile polish ostaje van aktuelnog desktop fokusa. Nije rađen commit, push ili deployment u ovom zadatku.
