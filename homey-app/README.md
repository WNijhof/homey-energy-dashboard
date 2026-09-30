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
| **Stroomprijs** | Dynamische prijzen van vandaag en morgen (van Homey Energie of EnergyZero), met het goedkoopste blok van 3 uur |
| **Kengetallen** | Meters voor zelfvoorzienend, eigen zon gebruikt en netto afgenomen of geleverd |
| **Elektriciteit** | Waar je stroom vandaan kwam (net, zon, batterij) en waar overschot heen ging, per uur of dag |
| **Vermogen vandaag** | Het vermogen door de dag heen, zoals in de HomeWizard-app: zelfverbruik van de zon onderaan, daarboven afname van het net en teruglevering, met de dagtotalen erboven. Het laatste stuk loopt live mee. Bij Week of Maand toont het blok vandaag |
| **Apparaten nu** | Wat er op dit moment het meeste stroom gebruikt, ook apparaten waarvan Homey het verbruik schat ("geschat") |
| **Energiestromen** | Sankey-grafiek zoals in Home Assistant: bronnen → huis → individuele verbruikers, live of voor de gekozen periode |
| **Verbruik per apparaat** | Ranglijst van kWh per apparaat in de gekozen periode, ook apparaten die alleen vermogen meten of een schatting in Homey hebben |
| **Kosten** | Kosten per bron: stroom, teruglevering, gas en water |
| **Zonne-energie** | Opwek per uur of dag |
| **Gas** | Gasverbruik per uur of dag |
| **Water** | Waterverbruik per uur of dag in liters, en het huidige verbruik |
| **Sluipverbruik** | Wat er 's nachts altijd aan staat, en wat dat per jaar kost |
| **Fasebelasting** | Stroom per fase ten opzichte van je hoofdzekering, en L1, L2 en L3 door de dag heen in één grafiek |
| **Batterijgebruik** | Wat de thuisbatterij per uur, dag of maand laadde (van de zon of het net) en leverde (aan huis of net), wat laden gemiddeld kostte en ontladen bespaarde, en per dag wanneer hij laadde of leverde en tegen welke prijs |
| **Maandpiek** | Voor het Belgische capaciteitstarief: je hoogste kwartiervermogen van deze maand, het lopende kwartier, de afgelopen 12 maanden en wat het kost |

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
- **Aansluiting**: je hoofdzekering per fase, meestal 25 A, voor het blok Fasebelasting. In België ook je **capaciteitstarief** (€/kW per jaar) en het minimum per maand (2,5 kW), voor het blok Maandpiek.
- **Zonneverwachting**: zet aan en vul per dakvlak het vermogen (kWp), de hellingshoek en de richting in. Er staan er twee klaar (bijvoorbeeld oost en west); met **+ Dakvlak toevoegen** kunnen het er tot 10 worden. Zie hieronder.
- **Stroomprijzen**: waar de marktprijzen vandaan komen. Zie *Prijzen en kosten* hieronder.
- **Stroomcontract**, **gascontract**, **vaste kosten en water**: zie *Prijzen en kosten* hieronder.

## Prijzen en kosten

**Waar de prijzen vandaan komen.** Staan er in Homey Energie dynamische prijzen (in de Homey-app bij Energie → Instellingen), dan gebruikt de app die: voor elk land dat Homey kent, per kwartier of uur. Heb je in Homey ook je kosten ingevuld (een formule zoals `([[price]] * 1,21) + 0,13`), dan rekent het dashboard daarmee de all-in prijs uit, en tellen de opslag en energiebelasting van het contract in de app niet mee. Zonder prijzen in Homey komen ze van EnergyZero, de Nederlandse marktprijs inclusief btw. Bij **Stroomprijzen** kun je ook zelf kiezen (Homey, EnergyZero of geen prijzen); daaronder staat wat nu in gebruik is. Laat je het stroomcontract in de app leeg, dan rekenen de kosten met de prijzen en kosten uit Homey, of met de vaste prijs die in Homey staat. Gas komt altijd van EnergyZero: Homey heeft geen dynamische gasprijzen. Bedragen staan in de valuta van Homey Energie.

Alle bedragen zijn inclusief btw. Laat een veld leeg om die kosten weg te laten.

- **Vast contract**: normaaltarief, en eventueel een daltarief met de daluren (standaard 23:00–07:00 en het hele weekend). Vul ook de terugleververgoeding in; met salderen is die meestal gelijk aan het normaaltarief. Bij **Terugleververgoeding na salderen** vul je in wat je leverancier vanaf 2027 betaalt; leeg rekent met het wettelijk minimum (de helft van de leveringsprijs zonder energiebelasting).
- **Dynamisch contract**: de prijs per uur is de marktprijs (EPEX, via EnergyZero) plus de energiebelasting plus de opslag van je leverancier. Kies je leverancier om de gebruikelijke opslag in te vullen (negentien leveranciers, van ANWB tot Zonneplan; waar bekend ook de gasopslag). Onder de keuze staat of de leverancier die bedragen zelf publiceert of dat ze van een vergelijkingssite komen. **Controleer ze altijd op je eigen contract of in de app van je leverancier.** De energiebelasting van 2026 (€ 0,11085 per kWh) staat al ingevuld. Stroom rekent de app per kwartier, zoals de meeste dynamische leveranciers; voor maanden en jaren per uur.
- **Gas**: een vaste prijs per m³, of dynamisch: de dagprijs plus energiebelasting (€ 0,7268 per m³ in 2026) en opslag.
- **Vaste kosten per maand**: leverings- en netbeheerkosten samen, zoals op je rekening. De **vermindering energiebelasting** (€ 628,96 in 2026) wordt verspreid over het jaar afgetrokken.
- **Water**: prijs per m³.
- **Salderen** (voor beide soorten contract): teruglevering wordt verrekend tegen de prijs die je op dat moment betaalt. Salderen stopt op 1 januari 2027; zet het dan uit. Zonder salderen levert teruglevering de terugleververgoeding (vast contract) of de marktprijs (dynamisch) op, min eventuele **terugleverkosten**.
- **Afname en teruglevering apart**: de app rekent afname en teruglevering elk met hun eigen prijs. Afname kost de marktprijs plus energiebelasting en opslag; teruglevering levert na salderen alleen de terugleververgoeding of de marktprijs op, zonder energiebelasting, min de terugleverkosten. Zo kloppen de bedragen ook na 2027, als de energiebelasting op teruglevering wegvalt.

De kosten worden per meterstand berekend met de prijs van dat moment, dus bij een dynamisch contract per uur. Het blok Kosten toont afname, teruglevering, gas, water en vaste kosten, en vergelijkt met de vorige periode tot hetzelfde moment. Het blok Stroomprijs toont bij een dynamisch contract de prijs die je echt betaalt, en wat je verbruik of teruglevering op dit moment per uur kost of oplevert.

## Einde salderen

Het blok **Einde salderen** rekent uit wat het stoppen van salderen op 1 januari 2027 jou kost: per teruggeleverde kWh het verschil tussen de prijs die je dan niet meer vermijdt en wat teruglevering zonder salderen oplevert, met je eigen metingen van vorig jaar (of dit jaar tot nu, als vorig jaar te weinig gegevens heeft) en je contract uit de instellingen. Teruglevering boven je verbruik van dat jaar werd nooit gesaldeerd en telt niet mee. Het blok laat ook zien wat elke kWh die je zelf gebruikt in plaats van teruglevert na 2027 bespaart.

## Zonne-energie

Het blok **Zonne-energie** toont de opbrengst per uur, dag of maand. Met de zonneverwachting aan staat bij elke dag een streepje voor de verwachting, en vergelijkt het blok de opbrengst met de verwachting (vandaag: met de verwachting tot nu) en toont het de opbrengst per kWp. Verder de beste dag of maand en, bij meer omvormers, de opbrengst per omvormer. De app bewaart daarvoor elke dag de verwachte kWh (tot ruim een jaar terug); de vergelijking begint dus op de dag dat je de zonneverwachting aanzet.

## Gas per graaddag

Hoeveel gas je nodig hebt, hangt af van het weer. De app haalt daarom de gemiddelde buitentemperatuur per dag op bij [Open-Meteo](https://open-meteo.com) (gratis, zonder account, voor de locatie van je Homey) en rekent die om naar gewogen graaddagen. In de blokken Gas en Verwarming staat dan het gas per graaddag, en in Verwarming de verandering ten opzichte van dezelfde periode vorig jaar. Zo zie je of je echt zuiniger stookt, ook als de winter zachter was.

## Meldingen

Het blok **Meldingen** laat zien als:

- een apparaat ongewoon lang aan staat (meer dan 20 W, langer dan het aantal uren bij de instellingen; standaard 4). Apparaten die altijd aan staan, zoals een koelkast of netwerkkast, en verwarming, laadpaal, batterij en zonnepanelen tellen niet mee;
- het sluipverbruik duidelijk hoger is dan normaal (de afgelopen twee weken);
- de P1-meter of een omvormer niet reageert;
- twee thuisbatterijen hetzelfde laadniveau en vermogen hebben: waarschijnlijk dezelfde batterij via twee apps (meerdere echte batterijen, zoals een groep stekkerbatterijen, geven geen melding);
- de stroomprijs negatief is terwijl je teruglevert (meer dan 100 W), zodat je iets kunt aanzetten of de panelen kunt terugregelen;
- met een capaciteitstarief ingevuld: het lopende kwartier boven je maandpiek uitkomt.

Zet **Ook in de Homey-tijdlijn** aan om elke melding hooguit één keer per dag als melding in de Homey-app te krijgen.

## Zonneverwachting

Met de zonneverwachting aan toont "Vermogen vandaag" een stippellijn met de verwachte opbrengst, en bovenin hoeveel kWh er vandaag en morgen verwacht wordt. De verwachting komt van [Forecast.Solar](https://forecast.solar) (gratis, zonder account) voor de locatie van je Homey, en wordt eens per uur opgehaald. Forecast.Solar rekent elk dakvlak apart en staat gratis 12 aanvragen per uur toe; met meer dan 10 dakvlakken haalt de app de verwachting daarom wat minder vaak op.

## Scherm (tablet aan de muur)

Met het **schermicoon** rechtsboven stel je per scherm in:

- **Volledig scherm**.
- **Scherm aan houden**, zodat de tablet niet op slot gaat (als de browser dat ondersteunt).
- **Licht of donker**: **Automatisch** volgt het apparaat, **Licht** en **Donker** staan vast, en **Volgt de zon** is donker van zonsondergang tot zonsopkomst op de plek van je Homey.
- **Sfeerkleur achtergrond**: een zachte gloed achter de blokken in de kleur van waar de stroom nu vandaan komt: geel voor de zon, blauw voor het net, groen-blauw voor de batterij, en rood zonder verbinding. Gebeurt er weinig, dan is er geen gloed.
- **Nachtstand**: van een tijd tot een tijd het scherm **dimmen** of **zwart** maken. Tik op het zwarte scherm om het een minuut te wekken. Zolang het zwart is, vraagt het dashboard niets op bij Homey.

Een dashboard dat dagen aan staat, schuift af en toe een paar pixels op tegen inbranden. Na een update van de app laadt het dashboard zichzelf opnieuw, maar niet terwijl je de indeling bewerkt; dat gebeurt dan na Opslaan of Annuleren.

Staat het blok Meldingen in je indeling, dan verschijnt een waarschuwing ook bovenin naast "Live". Tik erop om naar het blok te gaan. Is het opgelost, dan verdwijnt hij vanzelf. Op een touchscreen zijn de knoppen groter.

Onder **Beweging** kies je of de stromen bewegen: **Standaard** laat ze altijd bewegen (sierlijke effecten volgen de instelling "minder beweging" van je systeem), **Alle effecten** zet ook die aan, **Uit** zet alles stil. Via **Periode exporteren (CSV)** download je de gekozen periode als spreadsheet.

## Meerdere indelingen

Elk scherm kan een eigen indeling hebben, bijvoorbeeld een compacte voor de tablet in de keuken. Kies in de bewerkmodus (potlood) bij de indeling **Nieuwe indeling…**, geef een naam en sla op. Een scherm onthoudt zijn indeling; je kunt er ook een kiezen met het adres, bijvoorbeeld `http://<ip-van-je-homey>:8080/?indeling=keuken`. De standaardindeling stel je ook in bij de instellingen van de app.

## Op je beginscherm

Op een telefoon of tablet kun je het dashboard met **Zet op beginscherm** als app installeren, met eigen icoon en zonder adresbalk. Op iPhone en iPad werkt dat altijd; Android opent het via een gewoon http-adres in je thuisnetwerk als snelkoppeling in de browser, en pas als echte app via https (bijvoorbeeld via een tunnel).

## Widget voor Homey Dashboards

De app heeft twee widgets voor de Dashboards in de Homey-app. **Energie nu** toont het schema zon, net, huis en batterij met het vermogen van dit moment; bij **Tonen** kies je in plaats daarvan de kWh van vandaag, of allebei. **Energiestromen** is de uitgebreide versie. Die toont live waar je stroom vandaan komt (zon, net, batterij), in welke ruimtes die gebruikt wordt, en de grootste verbruikers per ruimte. In de widget kies je hoeveel apparaten per ruimte je ziet en of de stromen bewegen. Apparaten zonder stroommeting vallen onder "Overig". De widget is licht: Homey stuurt alleen een klein lijstje met waarden, de widget tekent zelf.

## Veiligheid

De webpagina is alleen bereikbaar binnen je thuisnetwerk, niet vanaf internet (tenzij je zelf poorten doorstuurt in je router, doe dat niet). Zonder toegangscode kan iedereen op je wifi het dashboard bekijken; stel er een in bij de instellingen als je dat niet wilt (na 5 foute pogingen is inloggen een minuut geblokkeerd). De pagina kan niets bedienen. Het enige dat je er kunt wijzigen is de indeling. Wil je niet dat iedereen op je wifi dat kan, stel dan een pincode in (na 5 foute pogingen is bewerken een minuut geblokkeerd). Apparaten, tarieven en andere instellingen wijzig je alleen via de Homey-app.

Maak je het dashboard via een tunnel of doorverwijzing bereikbaar vanaf internet, **stel dan altijd een toegangscode in**: anders kan iedereen die het adres vindt je verbruik zien, en daarmee ook wanneer je thuis bent.

Voor de prijzen gebruikt de app de prijzen die Homey zelf ophaalt, of haalt hij elk half uur de marktprijzen op bij EnergyZero, voor de zonneverwachting eens per uur de verwachting bij Forecast.Solar, en voor de graaddagen de buitentemperatuur bij Open-Meteo. Naar EnergyZero gaan geen gegevens over jouw huis. Naar Forecast.Solar en Open-Meteo gaan alleen de locatie van je Homey (afgerond) en, voor Forecast.Solar, de gegevens van je dakvlakken, geen verbruik.

## Problemen oplossen

Toont een blok geen gegevens, open dan `http://<ip-van-je-homey>:8080/api/diagnose`. Die pagina laat zien welke apparaten de app vond, welke metingen daarvan in Insights staan, hoeveel vermogensmetingen er vandaag zijn en welke meldingen er zijn. Plak die tekst bij een vraag op het forum (er staan geen wachtwoorden in).

Wordt een apparaat niet (goed) herkend, zoals een batterij of hybride omvormer? Gebruik dan **Diagnose delen** onderaan de instellingen van de app. Dat maakt een anoniem rapport: welke apps en metingen je apparaten hebben en hun huidige waarden, zonder namen, ruimtes, locatie of adres. Je ziet het rapport eerst; daarna kopieert de app het en opent een GitHub-issue waar het in staat (of waarin je het plakt).

Heeft je P1-meter geen vermogensmetingen (W) in Insights, dan rekent de app het vermogen voor "Vermogen vandaag" en het sluipverbruik uit met de kWh-tellers van de meter.

## Thuisbatterij

Heb je een thuisbatterij, dan staat er een eigen blok **Thuisbatterij** op het dashboard: het laadniveau, of hij laadt of ontlaadt en met hoeveel vermogen, hoeveel er in de gekozen periode geladen en ontladen is, welk deel met zon geladen is, het laadniveau door de dag heen, en bij Maand of Jaar het rendement. Met meerdere batterijen staat elke batterij er apart bij.

Het dashboard is voorbereid op een thuisbatterij, zoals de Zendure SolarFlow 2400 AC. Voeg de batterij in Homey toe (bijvoorbeeld met de app [Zendure Local](https://homey.app/en-us/app/com.tweakers.zendure/Zendure-Local/)). Het dashboard vindt hem dan vanzelf als hij als batterij bij Homey Energie bekend is. Zo niet, vink hem aan bij de instellingen.

Daarna verschijnen:

- een **batterij** onder in "Nu", met laadniveau en of hij laadt of ontlaadt;
- tegels voor **geladen** en **ontladen** kWh;
- in de elektriciteitsgrafiek **"Uit batterij"** boven de nul en **"Batterij geladen"** onder de nul;
- de batterij als bron en bestemming in de **Energiestromen**.

Zelfvoorzienend telt energie uit de batterij mee, net als in Home Assistant. Heeft de batterij ook een laadstatus (laden, ontladen, rust), dan leert de app zelf welke kant het vermogen op telt. Staan laden en ontladen toch omgedraaid, zet dan **"Batterij meet vermogen andersom"** aan.

Batterijen die hun vermogen op een andere manier doorgeven werken ook: met een apart laad- en ontlaadvermogen (zoals Indevolt), of met alleen kWh-tellers (zoals Enphase IQ Battery; het vermogen volgt dan uit hoe snel de tellers oplopen).

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
