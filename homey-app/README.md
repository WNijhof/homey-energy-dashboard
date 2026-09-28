# Energie Dashboard voor Homey Pro

Een Homey-app die een energiedashboard als webpagina aanbiedt in je thuisnetwerk. Het ziet eruit zoals de Homey-app en toont hetzelfde soort overzicht als het energy dashboard van Home Assistant. Alles draait op je Homey Pro zelf, zonder extra computer of API-key.

Open het dashboard op **http://&lt;ip-van-je-homey&gt;:8080**, bijvoorbeeld op een tablet aan de muur.

## Wat er op het dashboard staat

Het dashboard bestaat uit blokken. Je kiest zelf welke je ziet, in welke volgorde, hoe breed en hoe hoog.

## Taal

Rechtsboven op het dashboard kies je **NL** of **EN**. Elk scherm onthoudt zijn eigen keuze; de eerste keer volgt het de taal van de browser. De instellingen in de Homey-app volgen de taal van je Homey.

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
| Elektriciteit, Vermogen vandaag, Zonne-energie, Gas, Water, Stroomprijs, Verwarming, Laadpaal | De grafiek wordt hoger |
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
| **Vermogen vandaag** | Het vermogen door de dag heen, zoals in de HomeWizard-app: zelfverbruik van de zon onderaan, daarboven afname van het net en teruglevering, met de dagtotalen erboven. Het laatste stuk loopt live mee. Bij Week of Maand toont het blok vandaag |
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
- **Toegangscode voor het dashboard**: als je die invult, vraagt een browser er één keer om en onthoudt hem daarna. Voor een tablet aan de muur kun je ook het adres openen met `?code=…` erachter.
- **Pincode voor bewerken**: als je die invult, vraagt het dashboard erom bij het opslaan van een nieuwe indeling.
- **Indeling**: zet blokken aan of uit, verplaats ze met ↑ en ↓, en kies de breedte: smal (1/3), half, breed (2/3) of volledig. De hoogte stel je in op het dashboard zelf. Hier kun je die met **Eigen hoogte ✕** weer op automatisch zetten. Op een telefoon staan alle blokken onder elkaar. Zolang je geen eigen indeling kiest, verschijnen nieuwe blokken vanzelf zodra er een passend apparaat bijkomt, bijvoorbeeld een thuisbatterij of laadpaal. Met **Standaardindeling gebruiken** ga je daar weer naar terug.
- **Apparaten**: laat op "Automatisch" staan. De app zoekt zelf naar een P1-meter, zonnepanelen, thuisbatterij, boiler, warmtepomp of cv-ketel, thermostaat, laadpaal en watermeter.
- **Boiler**: inhoud (Lydos Hybrid: 80 of 110 liter), koud water, douchetemperatuur, liters per minuut van je douchekop, en vanaf welke temperatuur de boiler als "Warm" telt.
- **Aansluiting**: je hoofdzekering per fase, meestal 25 A, voor het blok Fasebelasting.
- **Zonneverwachting**: zet aan en vul per dakvlak het vermogen (kWp), de hellingshoek en de richting in. Twee dakvlakken kan ook, bijvoorbeeld oost en west. Zie hieronder.
- **Stroomcontract**, **gascontract**, **vaste kosten en water**: zie *Prijzen en kosten* hieronder.
- **Blok stroomprijs**: de uurprijzen van vandaag en morgen aan of uit.

## Prijzen en kosten

Alle bedragen zijn inclusief btw. Laat een veld leeg om die kosten weg te laten.

- **Vast contract**: normaaltarief, en eventueel een daltarief met de daluren (standaard 23:00–07:00 en het hele weekend). Vul ook de terugleververgoeding in; met salderen is die meestal gelijk aan het normaaltarief. Bij **Terugleververgoeding na salderen** vul je in wat je leverancier vanaf 2027 betaalt; leeg rekent met het wettelijk minimum (de helft van de leveringsprijs zonder energiebelasting).
- **Dynamisch contract**: de prijs per uur is de marktprijs (EPEX, via EnergyZero) plus de energiebelasting plus de opslag van je leverancier. Kies je leverancier om de gebruikelijke opslag in te vullen (negentien leveranciers, van ANWB tot Zonneplan; waar bekend ook de gasopslag). Onder de keuze staat of de leverancier die bedragen zelf publiceert of dat ze van een vergelijkingssite komen. **Controleer ze altijd op je eigen contract of in de app van je leverancier.** De energiebelasting van 2026 (€ 0,11085 per kWh) staat al ingevuld. Stroom rekent de app per kwartier, zoals de meeste dynamische leveranciers; voor maanden en jaren per uur.
- **Gas**: een vaste prijs per m³, of dynamisch: de dagprijs plus energiebelasting (€ 0,7268 per m³ in 2026) en opslag.
- **Vaste kosten per maand**: leverings- en netbeheerkosten samen, zoals op je rekening. De **vermindering energiebelasting** (€ 628,96 in 2026) wordt verspreid over het jaar afgetrokken.
- **Water**: prijs per m³.
- **Salderen** (voor beide soorten contract): teruglevering wordt verrekend tegen de prijs die je op dat moment betaalt. Salderen stopt op 1 januari 2027; zet het dan uit. Zonder salderen levert teruglevering de terugleververgoeding (vast contract) of de marktprijs (dynamisch) op, min eventuele **terugleverkosten**.

De kosten worden per meterstand berekend met de prijs van dat moment, dus bij een dynamisch contract per uur. Het blok Kosten toont afname, teruglevering, gas, water en vaste kosten, en vergelijkt met de vorige periode tot hetzelfde moment. Het blok Stroomprijs toont bij een dynamisch contract de prijs die je echt betaalt, en wat je verbruik of teruglevering op dit moment per uur kost of oplevert.

## Einde salderen

Het blok **Einde salderen** rekent uit wat het stoppen van salderen op 1 januari 2027 jou kost: per teruggeleverde kWh het verschil tussen de prijs die je dan niet meer vermijdt en wat teruglevering zonder salderen oplevert, met je eigen metingen van vorig jaar (of dit jaar tot nu, als vorig jaar te weinig gegevens heeft) en je contract uit de instellingen. Teruglevering boven je verbruik van dat jaar werd nooit gesaldeerd en telt niet mee. Het blok laat ook zien wat elke kWh die je zelf gebruikt in plaats van teruglevert na 2027 bespaart.

## Zonprestatie

Het blok **Zonprestatie** vergelijkt de opbrengst met de zonneverwachting (vandaag: met de verwachting tot nu), toont de opbrengst per kWp, de beste dag of maand en, bij meer omvormers, de opbrengst per omvormer. De grafiek toont per dag de opbrengst met een streepje voor de verwachting. De app bewaart daarvoor elke dag de verwachte kWh (tot ruim een jaar terug); de vergelijking begint dus op de dag dat je de zonneverwachting aanzet.

## Gas per graaddag

Hoeveel gas je nodig hebt, hangt af van het weer. De app haalt daarom de gemiddelde buitentemperatuur per dag op bij [Open-Meteo](https://open-meteo.com) (gratis, zonder account, voor de locatie van je Homey) en rekent die om naar gewogen graaddagen. In de blokken Gas en Verwarming staat dan het gas per graaddag, en in Verwarming de verandering ten opzichte van dezelfde periode vorig jaar. Zo zie je of je echt zuiniger stookt, ook als de winter zachter was.

## Meldingen

Het blok **Meldingen** laat zien als:

- een apparaat ongewoon lang aan staat (meer dan 20 W, langer dan het aantal uren bij de instellingen; standaard 4). Apparaten die altijd aan staan, zoals een koelkast of netwerkkast, en verwarming, laadpaal, batterij en zonnepanelen tellen niet mee;
- het sluipverbruik duidelijk hoger is dan normaal (de afgelopen twee weken);
- de P1-meter of een omvormer niet reageert;
- er meer dan één thuisbatterij gevonden is, mogelijk dezelfde batterij via twee apps.

Zet **Ook in de Homey-tijdlijn** aan om elke melding hooguit één keer per dag als melding in de Homey-app te krijgen.

## Zonneverwachting

Met de zonneverwachting aan toont "Vermogen vandaag" een stippellijn met de verwachte opbrengst, en bovenin hoeveel kWh er vandaag en morgen verwacht wordt. De verwachting komt van [Forecast.Solar](https://forecast.solar) (gratis, zonder account) voor de locatie van je Homey, en wordt eens per uur opgehaald.

## Scherm (tablet aan de muur)

Met het **schermicoon** rechtsboven stel je per scherm in:

- **Volledig scherm**.
- **Scherm aan houden**, zodat de tablet niet op slot gaat (als de browser dat ondersteunt).
- **Nachtstand**: van een tijd tot een tijd het scherm **dimmen** of **zwart** maken. Tik op het zwarte scherm om het een minuut te wekken. Zolang het zwart is, vraagt het dashboard niets op bij Homey.

Een dashboard dat dagen aan staat, schuift af en toe een paar pixels op tegen inbranden. Na een update van de app laadt het dashboard zichzelf opnieuw.

Onder **Beweging** kies je of de stromen bewegen: **Standaard** laat ze altijd bewegen (sierlijke effecten volgen de instelling "minder beweging" van je systeem), **Alle effecten** zet ook die aan, **Uit** zet alles stil. Via **Periode exporteren (CSV)** download je de gekozen periode als spreadsheet.

## Meerdere indelingen

Elk scherm kan een eigen indeling hebben, bijvoorbeeld een compacte voor de tablet in de keuken. Kies in de bewerkmodus (potlood) bij de indeling **Nieuwe indeling…**, geef een naam en sla op. Een scherm onthoudt zijn indeling; je kunt er ook een kiezen met het adres, bijvoorbeeld `http://<ip-van-je-homey>:8080/?indeling=keuken`. De standaardindeling stel je ook in bij de instellingen van de app.

## Op je beginscherm

Op een telefoon of tablet kun je het dashboard met **Zet op beginscherm** als app installeren, met eigen icoon en zonder adresbalk. Op iPhone en iPad werkt dat altijd; Android opent het via een gewoon http-adres in je thuisnetwerk als snelkoppeling in de browser, en pas als echte app via https (bijvoorbeeld via een tunnel).

## Widget voor Homey Dashboards

De app heeft twee widgets voor de Dashboards in de Homey-app. **Energie nu** toont het schema zon, net, huis en batterij met het vermogen van dit moment. **Energiestromen** is de uitgebreide versie. Die toont live waar je stroom vandaan komt (zon, net, batterij), in welke ruimtes die gebruikt wordt, en de grootste verbruikers per ruimte. In de widget kies je hoeveel apparaten per ruimte je ziet en of de stromen bewegen. Apparaten zonder stroommeting vallen onder "Overig". De widget is licht: Homey stuurt alleen een klein lijstje met waarden, de widget tekent zelf.

## Veiligheid

De webpagina is alleen bereikbaar binnen je thuisnetwerk, niet vanaf internet (tenzij je zelf poorten doorstuurt in je router, doe dat niet). Zonder toegangscode kan iedereen op je wifi het dashboard bekijken; stel er een in bij de instellingen als je dat niet wilt (na 5 foute pogingen is inloggen een minuut geblokkeerd). De pagina kan niets bedienen. Het enige dat je er kunt wijzigen is de indeling. Wil je niet dat iedereen op je wifi dat kan, stel dan een pincode in (na 5 foute pogingen is bewerken een minuut geblokkeerd). Apparaten, tarieven en andere instellingen wijzig je alleen via de Homey-app.

Maak je het dashboard via een tunnel of doorverwijzing bereikbaar vanaf internet, **stel dan altijd een toegangscode in**: anders kan iedereen die het adres vindt je verbruik zien, en daarmee ook wanneer je thuis bent.

Voor de prijzen haalt de app elk half uur de marktprijzen op bij EnergyZero, voor de zonneverwachting eens per uur de verwachting bij Forecast.Solar, en voor de graaddagen de buitentemperatuur bij Open-Meteo. Naar EnergyZero gaan geen gegevens over jouw huis. Naar Forecast.Solar en Open-Meteo gaan alleen de locatie van je Homey (afgerond) en, voor Forecast.Solar, de gegevens van je dakvlakken, geen verbruik.

## Problemen oplossen

Toont een blok geen gegevens, open dan `http://<ip-van-je-homey>:8080/api/diagnose`. Die pagina laat zien welke apparaten de app vond, welke metingen daarvan in Insights staan, hoeveel vermogensmetingen er vandaag zijn en welke meldingen er zijn. Plak die tekst bij een vraag op het forum (er staan geen wachtwoorden in).

Heeft je P1-meter geen vermogensmetingen (W) in Insights, dan rekent de app het vermogen voor "Vermogen vandaag" en het sluipverbruik uit met de kWh-tellers van de meter.

## Thuisbatterij

Heb je een thuisbatterij, dan staat er een eigen blok **Thuisbatterij** op het dashboard: het laadniveau, of hij laadt of ontlaadt en met hoeveel vermogen, hoeveel er in de gekozen periode geladen en ontladen is, welk deel met zon geladen is, het laadniveau door de dag heen, en bij Maand of Jaar het rendement. Met meerdere batterijen staat elke batterij er apart bij.

Het dashboard is voorbereid op een thuisbatterij, zoals de Zendure SolarFlow 2400 AC. Voeg de batterij in Homey toe (bijvoorbeeld met de app [Zendure Local](https://homey.app/en-us/app/com.tweakers.zendure/Zendure-Local/)). Het dashboard vindt hem dan vanzelf als hij als batterij bij Homey Energie bekend is. Zo niet, vink hem aan bij de instellingen.

Daarna verschijnen:

- een **batterij** onder in "Nu", met laadniveau en of hij laadt of ontlaadt;
- tegels voor **geladen** en **ontladen** kWh;
- in de elektriciteitsgrafiek **"Uit batterij"** boven de nul en **"Batterij geladen"** onder de nul;
- de batterij als bron en bestemming in de **Energiestromen**.

Zelfvoorzienend telt energie uit de batterij mee, net als in Home Assistant. Staan laden en ontladen omgedraaid, zet dan **"Batterij meet vermogen andersom"** aan.

## Energiestromen (Sankey)

Met **Live** en **Periode** bovenin het blok kies je wat je ziet. Live toont het vermogen van dit moment in watt, met bewegende stippen over de stromen, net als bij "Nu". Periode toont de kWh van vandaag, gisteren, deze week, deze maand of dit jaar. Het dashboard onthoudt je keuze per scherm.

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
