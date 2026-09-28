# Energie Dashboard voor Homey Pro

Een Homey-app die een energiedashboard als webpagina aanbiedt in je thuisnetwerk. Het ziet eruit zoals de Homey-app en toont hetzelfde soort overzicht als het energy dashboard van Home Assistant. Alles draait op je Homey Pro zelf, zonder extra computer of API-key.

Open het dashboard op **http://&lt;ip-van-je-homey&gt;:8080**, bijvoorbeeld op een tablet aan de muur.

## Wat er op het dashboard staat

Het dashboard bestaat uit blokken. Je kiest zelf welke je ziet, in welke volgorde, hoe breed en hoe hoog.

## De indeling aanpassen

Tik op het **potlood** rechtsboven op het dashboard:

- **Verplaatsen**: sleep een blok aan **⠿** naar een andere plek. Dit werkt met de muis en met je vinger.
- **Breedte**: sleep de blauwe greep aan de rechterkant van een blok. Hij klikt vast op 1/3, 1/2, 2/3 of de hele breedte.
- **Hoogte**: sleep de blauwe greep aan de onderkant van een blok. De hoogte klikt vast in stappen van 24 pixels, zodat blokken naast elkaar precies gelijk uitkomen. Een blok kan niet kleiner worden dan zijn inhoud toelaat. Met **Hoogte auto** bepaalt de inhoud weer de hoogte.
- **Verbergen**: tik op **✕**. Verborgen blokken staan onderin bij **Toevoegen**.
- **Opslaan** bewaart de indeling op je Homey, zodat al je schermen dezelfde indeling tonen. **Standaard** zet de automatische indeling terug.

Een rij vult zich van links naar rechts: 1/3 + 1/3 + 1/3, 1/2 + 1/2 en 2/3 + 1/3 vullen precies een rij. Naast een hoog blok schuiven kleinere blokken onder elkaar, zodat er geen lege ruimte overblijft. Op een telefoon staan alle blokken onder elkaar, op de hoogte van hun inhoud.

Wat er gebeurt als je een blok hoger maakt:

| Blok | Bij meer hoogte |
|---|---|
| Energie nu, Energiestromen | Het diagram wordt groter |
| Elektriciteit, Zonne-energie, Gas, Water, Stroomprijs, Verwarming, Laadpaal | De grafiek wordt hoger |
| Warm water | De temperatuurgrafiek van vandaag wordt hoger |
| Kengetallen | De meters worden groter; in een smal, hoog blok staan ze onder elkaar |
| Totalen | De tegels worden hoger |
| Apparaten nu, Verbruik per apparaat, Kosten | Er passen meer regels in; wat niet past, kun je scrollen |
| Sluipverbruik, Fasebelasting | De inhoud wordt verticaal verdeeld | De indeling kan ook in de instellingen van de app in Homey.

| Blok | Toont |
|---|---|
| **Energie nu** | Live energiestroom tussen zon, net, huis en thuisbatterij, met de totalen van vandaag |
| **Warm water** | Temperatuur van de boiler, of hij warm is, geschatte doucheminuten; bij een Lydos ook douchebeurten |
| **Verwarming** | Kamertemperatuur van de thermostaat, vermogen van warmtepomp of cv-ketel, stroom- en gasverbruik, grafiek |
| **Laadpaal** | Laadvermogen, status, geladen kWh, accu van de auto, grafiek |
| **Totalen** | Verbruik, net, zon, teruglevering, gas, water, batterij, zelfvoorzienend en kosten, met ▲/▼ ten opzichte van de vorige periode |
| **Stroomprijs** | Dynamische uurprijzen van vandaag en morgen (EnergyZero), met het goedkoopste blok van 3 uur |
| **Kengetallen** | Meters voor zelfvoorzienend, eigen zon gebruikt en netto afgenomen of geleverd |
| **Elektriciteit** | Waar je stroom vandaan kwam (net, zon, batterij) en waar overschot heen ging, per uur of dag |
| **Apparaten nu** | Wat er op dit moment het meeste stroom gebruikt |
| **Energiestromen** | Sankey-grafiek zoals in Home Assistant: bronnen → huis → individuele verbruikers, live of voor de gekozen periode |
| **Verbruik per apparaat** | Ranglijst van kWh per apparaat in de gekozen periode |
| **Kosten** | Kosten per bron: stroom, teruglevering, gas en water |
| **Zonne-energie** | Opwek per uur of dag |
| **Gas** | Gasverbruik per uur of dag |
| **Water** | Waterverbruik per uur of dag in liters, en het huidige verbruik |
| **Sluipverbruik** | Wat er 's nachts altijd aan staat, en wat dat per jaar kost |
| **Fasebelasting** | Stroom per fase ten opzichte van je hoofdzekering |

Blokken zonder passend apparaat laat de standaardindeling weg. Het dashboard werkt dus ook voor een huis zonder zonnepanelen, met een hybride of all-electric warmtepomp, of met een laadpaal.

## Installeren

Installeer de [Homey CLI](https://apps.developer.homey.app/the-basics/getting-started/homey-cli) (`npm install -g homey`) en log in met `homey login`. Daarna:

```powershell
cd homey-app
npm install
homey app install
```

Bij het installeren vraagt Homey om **volledige toegang tot Homey**. Die is nodig omdat de app de gegevens van andere apps leest: de P1-meter, je omvormer en de Lydos. De app leest alleen gegevens en bedient niets.

## Het adres vinden

In de Homey-app: *Meer → Apps → Energie Dashboard → Instellingen*. Bovenaan staat de link naar het dashboard, en of de webpagina draait.

## Instellingen

Op dezelfde instellingenpagina:

- **Poort**: standaard 8080. Wijzig die als die poort al door iets anders gebruikt wordt.
- **Pincode voor bewerken**: als je die invult, vraagt het dashboard erom bij het opslaan van een nieuwe indeling.
- **Indeling**: zet blokken aan of uit, verplaats ze met ↑ en ↓, en kies de breedte: smal (1/3), half, breed (2/3) of volledig. De hoogte stel je in op het dashboard zelf. Hier kun je die met **Eigen hoogte ✕** weer op automatisch zetten. Op een telefoon staan alle blokken onder elkaar. Zolang je geen eigen indeling kiest, verschijnen nieuwe blokken vanzelf zodra er een passend apparaat bijkomt, bijvoorbeeld een thuisbatterij of laadpaal. Met **Standaardindeling gebruiken** ga je daar weer naar terug.
- **Apparaten**: laat op "Automatisch" staan. De app zoekt zelf naar een P1-meter, zonnepanelen, thuisbatterij, boiler, warmtepomp of cv-ketel, thermostaat, laadpaal en watermeter.
- **Boiler**: inhoud (Lydos Hybrid: 80 of 110 liter), koud water, douchetemperatuur, liters per minuut van je douchekop, en vanaf welke temperatuur de boiler als "Warm" telt.
- **Aansluiting**: je hoofdzekering per fase, meestal 25 A, voor het blok Fasebelasting.
- **Dynamische stroomprijs**: aan of uit, plus een vaste opslag per kWh. EnergyZero geeft de kale uurprijs inclusief btw. Wil je de prijs die je echt betaalt, tel dan de inkoopvergoeding van je leverancier en de energiebelasting erbij op als opslag.
- **Tarieven**: prijzen per kWh, m³ gas en m³ water voor de kosten. Laat leeg als je geen kosten wilt zien.

## Veiligheid

De webpagina is alleen bereikbaar binnen je thuisnetwerk, niet vanaf internet (tenzij je zelf poorten doorstuurt in je router, doe dat niet). Er is geen wachtwoord: iedereen op je wifi kan het dashboard bekijken. De pagina kan niets bedienen. Het enige dat je er kunt wijzigen is de indeling. Wil je niet dat iedereen op je wifi dat kan, stel dan een pincode in (na 5 foute pogingen is bewerken een minuut geblokkeerd). Apparaten, tarieven en andere instellingen wijzig je alleen via de Homey-app.

Voor het blok Stroomprijs haalt de app elk half uur de prijzen op bij EnergyZero. Daarbij gaan geen gegevens over jouw huis of verbruik mee.

## Thuisbatterij

Het dashboard is voorbereid op een thuisbatterij, zoals de Zendure SolarFlow 2400 AC. Voeg de batterij in Homey toe (bijvoorbeeld met de app [Zendure Local](https://homey.app/en-us/app/com.tweakers.zendure/Zendure-Local/)). Het dashboard vindt hem dan vanzelf als hij als batterij bij Homey Energie bekend is. Zo niet, vink hem aan bij de instellingen.

Daarna verschijnen:

- een **batterij** onder in "Nu", met laadniveau en of hij laadt of ontlaadt;
- tegels voor **geladen** en **ontladen** kWh;
- in de elektriciteitsgrafiek **"Uit batterij"** boven de nul en **"Batterij geladen"** onder de nul;
- de batterij als bron en bestemming in de **Energiestromen**.

Zelfvoorzienend telt energie uit de batterij mee, net als in Home Assistant. Staan laden en ontladen omgedraaid, zet dan **"Batterij meet vermogen andersom"** aan.

## Energiestromen (Sankey)

Met **Live** en **Periode** bovenin het blok kies je wat je ziet. Live toont het vermogen van dit moment in watt, met bewegende stippen over de stromen, net als bij "Nu". Periode toont de kWh van vandaag, gisteren, deze week of deze maand. Het dashboard onthoudt je keuze per scherm.

De grafiek toont:

1. **Bronnen**: zon, net en batterij.
2. **Bestemmingen**: het huis, teruglevering en het laden van de batterij.
3. **Verbruikers**: vanuit het huis per apparaat.

Apparaten verschijnen hier als ze een kWh-meter hebben (Periode) of hun vermogen meten (Live), bijvoorbeeld slimme stekkers. Wat niet per apparaat gemeten wordt, staat bij **Niet gemeten**. Apparaten met minder dan 1,5% van het verbruik tellen ook mee bij Niet gemeten, en er worden maximaal 15 verbruikers getoond.

Let op: meet een apparaat een groep van andere gemeten apparaten (bijvoorbeeld een tussenmeter op een groep), dan telt dat verbruik dubbel.

## Vergelijking met de vorige periode

De ▲/▼ in de tegels vergelijkt met de vorige periode tot hetzelfde moment: vandaag tot nu met gisteren tot hetzelfde uur, deze week met vorige week tot dezelfde dag, deze maand met vorige maand tot dezelfde dag. Groen betekent beter (minder verbruik, meer zon), rood slechter.

## Sluipverbruik

Het sluipverbruik is het laagste verbruik van je huis tussen 1:00 en 5:00 afgelopen nacht, als alleen de apparaten aan staan die altijd aan staan (koelkast, router, standby). De app neemt daarvoor een lage waarde uit die nacht, niet het absolute minimum, zodat één afwijkende meting niet telt. Een thuisbatterij die 's nachts ontlaadt wordt meegerekend.

## Hoe de doucheminuten berekend worden

```
liters douchewater = boilerinhoud × (T_boiler − T_koud) / (T_douche − T_koud)
doucheminuten      = liters douchewater / liters per minuut
```

80 L op 55 °C, koud water 10 °C, douchen op 40 °C en 8 L/min geeft 80 × 45 / 30 = 120 L, dus ongeveer 15 minuten. Dit is een schatting, omdat het water niet overal in de tank even warm is. Het aantal douchebeurten komt rechtstreeks van de Lydos.

## Waar de gegevens vandaan komen

- **Live waarden** komen van de apparaten zelf en worden elke 10 seconden ververst.
- **Totalen en grafieken** worden berekend uit de Insights van de meterstanden: stroom van en naar het net en gas van de P1-meter, en de opgewekte kWh van de omvormer. Ze worden elke minuut ververst.
- **Blijven de grafieken leeg?** Controleer of Insights aan staat voor die meters (*Apparaat → Instellingen → Insights*).

## Ontwikkelen

De webpagina (`web/`) en de rekenlogica (`lib/energy.js`) worden gedeeld met de testserver in de map erboven. Pas ze daar aan in `shared/`, `public/index.html` en `lib/`, en voer daarna `npm run sync` uit in de map erboven. Alleen `web/site.js` is specifiek voor de Homey-app.

Zonder Homey bekijken: start in de map erboven `node server.js` en open http://localhost:8080 (dashboard met voorbeelddata) of http://localhost:8080/preview/settings/ (instellingenpagina).
