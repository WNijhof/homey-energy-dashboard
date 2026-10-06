# Energie Dashboard voor Homey Pro

Een Homey-app die een energiedashboard als webpagina aanbiedt in je thuisnetwerk. Het ziet eruit zoals de Homey-app en toont hetzelfde soort overzicht als het energy dashboard van Home Assistant. Alles draait op je Homey Pro zelf, zonder extra computer of API-key.

Open het dashboard op **http://&lt;ip-van-je-homey&gt;:8686**, bijvoorbeeld op een tablet aan de muur.

## Wat er op het dashboard staat

Het dashboard bestaat uit blokken. Je kiest zelf welke je ziet, in welke volgorde, hoe breed en hoe hoog (zie *De indeling aanpassen*).

| Blok | Toont |
|---|---|
| **Energie nu** | Live energiestroom tussen zon, net, huis en thuisbatterij, met de totalen van vandaag |
| **Warm water** | Temperatuur van de boiler, of hij warm is, geschatte doucheminuten; bij een Lydos ook douchebeurten |
| **Verwarming** | Kamertemperatuur van de thermostaat, vermogen van warmtepomp of cv-ketel, stroom- en gasverbruik, grafiek |
| **Laadpaal** | Laadvermogen, status, geladen kWh, accu van de auto, grafiek |
| **Thuisbatterij** | Laadniveau, laden of ontladen, geladen en ontladen kWh, deel met zon geladen, laadniveau door de dag en rendement (zie *Thuisbatterij*) |
| **Totalen** | Verbruik, net, zon, teruglevering, gas, water, batterij, zelfvoorzienend en kosten, met ▲/▼ ten opzichte van de vorige periode |
| **Stroomprijs** | Dynamische prijzen van vandaag en morgen (van Homey Energie, EnergyZero of Power by the Hour), met het goedkoopste blok van 3 uur |
| **Kengetallen** | Meters voor zelfvoorzienend, eigen zon gebruikt en netto afgenomen of geleverd |
| **Elektriciteit** | Waar je stroom vandaan kwam (net, zon, batterij) en waar overschot heen ging, per uur of dag |
| **Vermogen vandaag** | Het vermogen door de dag heen, zoals in de HomeWizard-app: zelfverbruik van de zon onderaan, daarboven afname van het net en teruglevering, met de dagtotalen erboven. Het laatste stuk loopt live mee. Bij Week of Maand toont het blok vandaag |
| **Apparaten nu** | Wat er op dit moment het meeste stroom gebruikt, ook apparaten waarvan Homey het verbruik schat ("geschat") |
| **Energiestromen** | Sankey-grafiek zoals in Home Assistant: bronnen → huis → individuele verbruikers, live of voor de gekozen periode |
| **Verbruik per apparaat** | Ranglijst van kWh per apparaat in de gekozen periode, ook apparaten die alleen vermogen meten of een schatting in Homey hebben. Apparaten die in Homey op *Uitsluiten van Energie* staan en de kopieën van Power by the Hour (Σ) tellen niet mee |
| **Kosten** | Kosten per bron: stroom, teruglevering, gas en water |
| **Einde salderen** | Wat het stoppen van salderen op 1 januari 2027 jou kost, met je eigen metingen (zie *Einde salderen*) |
| **Zonne-energie** | Opwek per uur of dag |
| **Gas** | Gasverbruik per uur of dag |
| **Water** | Waterverbruik per uur of dag in liters, en het huidige verbruik |
| **Sluipverbruik** | Wat er 's nachts altijd aan staat, en wat dat per jaar kost |
| **Batterij kiezen** | Voor wie een thuisbatterij overweegt: je verbruik per avond en nacht (zon onder 200 W) over de afgelopen 365 dagen, het zonne-overschot per maand, en hoeveel van dat verbruik een batterij van 2,5 tot 15 kWh en 800 W tot 5 kW zou dekken (zie *Batterij kiezen*). Staat niet standaard op het dashboard; voeg het toe via het potlood |
| **Meldingen** | Apparaten die blijven aanstaan, stijgend sluipverbruik, een meter die niet reageert, een negatieve prijs terwijl je teruglevert (zie *Meldingen*) |
| **Fasebelasting** | Stroom per fase ten opzichte van je hoofdzekering, en L1, L2 en L3 door de dag heen in één grafiek |
| **Groepen** | De belasting per groep in je meterkast ten opzichte van de zekering, per fase, met de apparaten die het meest gebruiken en per fase wat de groepen niet verklaren (Overig). Daaronder per groep een balk door de dag. Je maakt de groepen aan in de instellingen van de app |
| **Batterijgebruik** | Wat de thuisbatterij per uur, dag of maand laadde (van de zon of het net) en leverde (aan huis of net), wat laden gemiddeld kostte en ontladen bespaarde, en per dag wanneer hij laadde of leverde en tegen welke prijs |
| **Maandpiek** | Voor het Belgische capaciteitstarief: je hoogste kwartiervermogen van deze maand, het lopende kwartier, de afgelopen 12 maanden en wat het kost |

Blokken zonder passend apparaat laat de standaardindeling weg. Het dashboard werkt dus ook voor een huis zonder zonnepanelen, met een hybride of all-electric warmtepomp, of met een laadpaal.

## Taal

Rechtsboven op het dashboard kies je de taal: Nederlands, Engels, Duits, Noors, Zweeds, Deens, Italiaans, Frans, Portugees of Spaans. Elk scherm onthoudt zijn eigen keuze; de eerste keer volgt het de taal van de browser. De instellingen in de Homey-app volgen de taal van je Homey.

## Uitleg bij elk blok

Naast de titel van elk blok staat een kleine **(i)**. Een tik toont wat het blok laat zien, waar de getallen vandaan komen en hoe ze berekend zijn. Bij de blokken met bedragen (Kosten, Stroomprijs, Einde salderen, Thuisbatterij, Batterijgebruik, Sluipverbruik en Maandpiek) staat de berekening erbij met je eigen getallen, bijvoorbeeld *9,88 kWh × € 0,256 = € 2,53*, en hoe de prijs is opgebouwd uit je contract of je formule in Homey.

## Terugkijken

Met **Vandaag** of **Gisteren** gekozen staat onder de kop een schuifbalk met het verbruik van het huis over de dag. Sleep naar een tijdstip, of klik in de grafiek *Vermogen*, en de blokken van "nu" laten dat moment zien: de energiestroom, Apparaten nu, de live Energiestromen, de batterij, de boiler, verwarming, laadpaal, fasen en water. Zo zie je bijvoorbeeld welk apparaat die piek om 18:15 veroorzaakte. Onder de cirkels van *Nu* staan dan de kWh van de dag tot dat moment. De blokken van de periode (totalen en grafieken) blijven zoals ze zijn.

- Het werkt in stappen van 5 minuten: het vermogen is het gemiddelde over die 5 minuten, uit Homey Insights. Een apparaat zonder Insights voor zijn vermogen, of met alleen een schatting in Homey Energie, staat er dan niet bij. Een modus (zoals *Eco*) bewaart Insights niet; die blijft leeg.
- De eerste keer leest Homey de hele dag van alle apparaten met een stroommeting. Bij veel apparaten duurt dat even; daarna gaat schuiven snel.
- **Nu** rechts van de balk brengt je terug. Na 10 minuten zonder schuiven gaat het dashboard zelf terug naar nu, zodat een tablet aan de muur niet in het verleden blijft staan.

## De indeling aanpassen

Tik op het **potlood** rechtsboven op het dashboard:

- **Verplaatsen**: sleep een blok aan **⠿** naar een andere plek. Dit werkt met de muis en met je vinger.
- **Breedte**: sleep de blauwe greep aan de rechterkant van een blok. Hij klikt vast op 1/3, 1/2, 2/3 of de hele breedte.
- **Hoogte**: sleep de blauwe greep aan de onderkant van een blok. De hoogte klikt vast in stappen van 24 pixels, zodat blokken naast elkaar precies gelijk uitkomen. Een blok kan niet kleiner worden dan zijn inhoud toelaat. Met **Hoogte auto** bepaalt de inhoud weer de hoogte.
- **Verbergen**: tik op **✕**. Verborgen blokken staan onderin bij **Toevoegen**.
- **Opslaan** bewaart de indeling op je Homey, zodat elk scherm met deze indeling hem meteen ziet (zie *Meerdere indelingen*). **Standaard** zet de automatische indeling terug.

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
| Sluipverbruik, Fasebelasting | De inhoud wordt verticaal verdeeld |

De indeling kan ook in de instellingen van de app in Homey.

## Installeren

De app staat als testversie in de Homey App Store: open https://homey.app/a/com.drpeppers.energydashboard/test/ en kies **Installeren**. Updates komen daarna vanzelf binnen, net als bij andere apps.

Bij het installeren vraagt Homey om **volledige toegang tot Homey**. Die is nodig omdat de app de gegevens van andere apps leest: de P1-meter, je omvormer, je batterij en de boiler. De app leest alleen gegevens en bedient niets. Voor de prijzen uit Power by the Hour vraagt hij ook toegang tot die app.

Zelf bouwen kan ook, met de [Homey CLI](https://apps.developer.homey.app/the-basics/getting-started/homey-cli) (`npm install -g homey`, daarna `homey login`): `npm install` en `homey app install` in deze map. Zie ook *Ontwikkelen*.

## Het adres vinden

In de Homey-app: *Meer → Apps → Energie Dashboard → Instellingen*. Bovenaan staat de link naar het dashboard, en of de webpagina draait.

## Instellingen

Op dezelfde instellingenpagina. Elke wijziging wordt meteen bewaard; het vinkje bovenin Homey sluit alleen de pagina.

- **Poort**: standaard 8686 (wie de app al voor versie 0.2.4 had, houdt 8080). Wijzig die als die poort al door iets anders gebruikt wordt.
- **Toegangscode voor het dashboard**: als je die invult, vraagt een browser er één keer om en onthoudt hem daarna. Voor een tablet aan de muur kun je ook het adres openen met `?code=…` erachter.
- **Pincode voor bewerken**: als je die invult, vraagt het dashboard erom bij het opslaan van een nieuwe indeling.
- **Indeling**: zet blokken aan of uit, verplaats ze met ↑ en ↓, en kies de breedte: smal (1/3), half, breed (2/3) of volledig. De hoogte stel je in op het dashboard zelf. Hier kun je die met **Eigen hoogte ✕** weer op automatisch zetten. Op een telefoon staan alle blokken onder elkaar. Zolang je geen eigen indeling kiest, verschijnen nieuwe blokken vanzelf zodra er een passend apparaat bijkomt, bijvoorbeeld een thuisbatterij of laadpaal. Met **Standaardindeling gebruiken** ga je daar weer naar terug.
- **Apparaten**: laat op "Automatisch" staan. De app zoekt zelf naar een P1-meter, zonnepanelen, thuisbatterij, boiler, warmtepomp of cv-ketel, thermostaat, laadpaal en watermeter. Apparaten die je in Homey op *Uitsluiten van Energie* zette, en de kopieën die Power by the Hour maakt (Σ), slaat hij over; die kun je wel zelf aanvinken. Kiest de app de verkeerde, vink dan zelf aan welke apparaten hij moet gebruiken.
- **Boiler**: inhoud (Lydos Hybrid: 80 of 110 liter), koud water, douchetemperatuur, liters per minuut van je douchekop, en vanaf welke temperatuur de boiler als "Warm" telt.
- **Aansluiting**: je hoofdzekering per fase, meestal 25 A, voor het blok Fasebelasting. In België ook je **capaciteitstarief** (€/kW per jaar) en het minimum per maand (2,5 kW), voor het blok Maandpiek.
- **Groepen in de meterkast**: maak je groepen aan met hun zekering en fase (twee of drie fasen voor bijvoorbeeld een kookgroep), vul eventueel een vast verbruik in voor apparaten zonder meting (modem, switch) en kies per apparaat met een vermogensmeting op welke groep het zit. Apparaten zonder meter waarvoor in Homey een verbruik is ingesteld (Geavanceerde instellingen, Energie, bijvoorbeeld een NAS of camera) kun je ook aan een groep geven; die tellen mee met dat verbruik. Kies ook op welke fase je zonnepanelen invoeden en, met een thuisbatterij, op welke fase die zit, zodat Overig per fase klopt. Elke groep krijgt twee tags voor Flows: belasting (% van de zekering) en vermogen (W), bijvoorbeeld voor een melding als een groep boven 90% komt.
- **Zonneverwachting**: zet aan en vul per dakvlak het vermogen (kWp), de hellingshoek en de richting in. Er staan er twee klaar (bijvoorbeeld oost en west); met **+ Dakvlak toevoegen** kunnen het er tot 10 worden. Zie hieronder.
- **Stroomprijzen**: waar de marktprijzen vandaan komen. Zie *Prijzen en kosten* hieronder.
- **Stroomcontract**, **gascontract**, **vaste kosten en water**: zie *Prijzen en kosten* hieronder.

## Prijzen en kosten

**Waar de prijzen vandaan komen.** Staan er in Homey Energie dynamische prijzen (in de Homey-app bij Energie → Instellingen), dan gebruikt de app die: voor elk land dat Homey kent, per kwartier of uur. Heb je in Homey ook je kosten ingevuld (een formule zoals `([[price]] * 1,21) + 0,13`), dan rekent het dashboard daarmee de all-in prijs uit, en tellen de opslag en energiebelasting van het contract in de app niet mee. Zonder prijzen in Homey komen ze van EnergyZero, de Nederlandse marktprijs inclusief btw. Bij **Stroomprijzen** kun je ook zelf kiezen (Homey, EnergyZero, Power by the Hour of geen prijzen); daaronder staat wat nu in gebruik is. Kies je **Power by the Hour**, dan neemt de app de prijzen van die app over, all-in met de opslagen die je daar invulde, en ook de terugleverprijs. Komende prijzen komen uit de app zelf, eerdere uit Insights van het prijsapparaat van Power by the Hour (een apparaat per kwartier gaat voor een apparaat per uur). Laat je het stroomcontract in de app leeg, dan rekenen de kosten met de prijzen en kosten uit Homey, of met de vaste prijs die in Homey staat. Gas komt altijd van EnergyZero: Homey heeft geen dynamische gasprijzen. Bedragen staan in de valuta van Homey Energie.

Alle bedragen zijn inclusief btw. Laat een veld leeg om die kosten weg te laten.

- **Vast contract**: normaaltarief, en eventueel een daltarief met de daluren (standaard 23:00–07:00 en het hele weekend). Vul ook de terugleververgoeding in; met salderen is die meestal gelijk aan het normaaltarief. Bij **Terugleververgoeding na salderen** vul je in wat je leverancier vanaf 2027 betaalt; leeg rekent met het wettelijk minimum (de helft van de leveringsprijs zonder energiebelasting).
- **Dynamisch contract**: de prijs per uur is de marktprijs (EPEX, via EnergyZero) plus de energiebelasting plus de opslag van je leverancier. Kies je leverancier om de gebruikelijke opslag in te vullen (negentien leveranciers, van ANWB tot Zonneplan; waar bekend ook de gasopslag). Onder de keuze staat of de leverancier die bedragen zelf publiceert of dat ze van een vergelijkingssite komen. **Controleer ze altijd op je eigen contract of in de app van je leverancier.** De energiebelasting van 2026 (€ 0,11085 per kWh) staat al ingevuld. Stroom rekent de app per kwartier, zoals de meeste dynamische leveranciers; voor maanden en jaren per uur.
- **Gas**: een vaste prijs per m³, of dynamisch: de dagprijs plus energiebelasting (€ 0,7268 per m³ in 2026) en opslag. Heb je geen gas (all-electric), kies dan **Geen gas**: dan verdwijnt gas overal van het dashboard. Geeft je P1-meter een lege gasteller door, dan gebeurt dat ook vanzelf.
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

Met het **schermicoon** (het monitortje) rechtsboven stel je per scherm in. Deze keuzes bewaart de browser, dus elke tablet of browser heeft zijn eigen instellingen.

- **Volledig scherm**.
- **Scherm aan houden**, zodat de tablet niet op slot gaat (als de browser dat ondersteunt).
- **Periode exporteren (CSV)**: download de gekozen periode als spreadsheet.
- **Licht of donker**: **Automatisch** volgt het apparaat, **Licht** en **Donker** staan vast, en **Volgt de zon** is donker van zonsondergang tot zonsopkomst op de plek van je Homey.
- **Sfeerkleur achtergrond**: een zachte gloed achter de blokken in de kleur van waar de stroom nu vandaan komt: geel voor de zon, blauw voor het net, groen-blauw voor de batterij, en rood zonder verbinding. Gebeurt er weinig, dan is er geen gloed.
- **Beweging**: **Standaard** laat de stromen altijd bewegen (sierlijke effecten volgen de instelling "minder beweging" van je systeem), **Alle effecten** zet ook die aan, **Uit** zet alles stil.
- **Snelheid stromen**: **Sneller**, **Standaard**, **Trager** of **Kruipend** (tien keer zo traag). Deze keuze staat er niet als Beweging op Uit staat.
- **Nachtstand**: van een tijd tot een tijd het scherm **dimmen** of **zwart** maken. Tik op het zwarte scherm om het een minuut te wekken. Zolang het zwart is, vraagt het dashboard niets op bij Homey.

Een dashboard dat dagen aan staat, schuift af en toe een paar pixels op tegen inbranden. Na een update van de app laadt het dashboard zichzelf opnieuw, maar niet terwijl je de indeling bewerkt; dat gebeurt dan na Opslaan of Annuleren.

Staat het blok Meldingen in je indeling, dan verschijnt een waarschuwing ook bovenin naast "Live". Tik erop om naar het blok te gaan. Is het opgelost, dan verdwijnt hij vanzelf. Op een touchscreen zijn de knoppen groter.

## Meerdere indelingen

Elk scherm kan een eigen indeling hebben, bijvoorbeeld een compacte voor de tablet in de keuken. Kies in de bewerkmodus (potlood) bij de indeling **Nieuwe indeling…**, geef een naam en sla op. Een scherm onthoudt zijn indeling; je kunt er ook een kiezen met het adres, bijvoorbeeld `http://<ip-van-je-homey>:8686/?indeling=keuken`. De standaardindeling stel je ook in bij de instellingen van de app.

## Op je beginscherm

Op een telefoon of tablet kun je het dashboard met **Zet op beginscherm** als app installeren, met eigen icoon en zonder adresbalk. Op iPhone en iPad werkt dat altijd; Android opent het via een gewoon http-adres in je thuisnetwerk als snelkoppeling in de browser, en pas als echte app via https (bijvoorbeeld via een tunnel).

## Widget voor Homey Dashboards

De app heeft twee widgets voor de Dashboards in de Homey-app. **Energie nu** toont het schema zon, net, huis en batterij met het vermogen van dit moment; bij **Tonen** kies je in plaats daarvan de kWh van vandaag, of allebei. **Energiestromen** is de uitgebreide versie. Die toont live waar je stroom vandaan komt (zon, net, batterij), in welke ruimtes die gebruikt wordt, en de grootste verbruikers per ruimte. In de widget kies je hoeveel apparaten per ruimte je ziet en of de stromen bewegen. Apparaten zonder stroommeting vallen onder "Overig". De widget is licht: Homey stuurt alleen een klein lijstje met waarden, de widget tekent zelf.

## Veiligheid

De webpagina is alleen bereikbaar binnen je thuisnetwerk, niet vanaf internet (tenzij je zelf poorten doorstuurt in je router, doe dat niet). Zonder toegangscode kan iedereen op je wifi het dashboard bekijken; stel er een in bij de instellingen als je dat niet wilt (na 5 foute pogingen is inloggen een minuut geblokkeerd). De pagina kan niets bedienen. Het enige dat je er kunt wijzigen is de indeling. Wil je niet dat iedereen op je wifi dat kan, stel dan een pincode in (na 5 foute pogingen is bewerken een minuut geblokkeerd). Apparaten, tarieven en andere instellingen wijzig je alleen via de Homey-app.

Maak je het dashboard via een tunnel of doorverwijzing bereikbaar vanaf internet, **stel dan altijd een toegangscode in**: anders kan iedereen die het adres vindt je verbruik zien, en daarmee ook wanneer je thuis bent.

Voor de prijzen gebruikt de app de prijzen die Homey zelf ophaalt, of haalt hij elk half uur de marktprijzen op bij EnergyZero, voor de zonneverwachting eens per uur de verwachting bij Forecast.Solar, en voor de graaddagen de buitentemperatuur bij Open-Meteo. Naar EnergyZero gaan geen gegevens over jouw huis. Naar Forecast.Solar en Open-Meteo gaan alleen de locatie van je Homey (afgerond) en, voor Forecast.Solar, de gegevens van je dakvlakken, geen verbruik.

## Problemen oplossen

Toont een blok geen gegevens, open dan `http://<ip-van-je-homey>:8686/api/diagnose`. Die pagina laat zien welke apparaten de app vond, welke metingen daarvan in Insights staan, hoeveel vermogensmetingen er vandaag zijn en welke meldingen er zijn. Plak die tekst bij een vraag op het forum (er staan geen wachtwoorden in).

Wordt een apparaat niet (goed) herkend, zoals een batterij of hybride omvormer? Gebruik dan **Diagnose delen**: met de **!**-knop naast het potlood op het dashboard (de **?** ernaast opent deze handleiding), of onderaan de instellingen van de app. Dat maakt een anoniem rapport: welke apps en metingen je apparaten hebben en hun huidige waarden, zonder namen, ruimtes, locatie of adres. Met **Kopiëren en mailen** opent je mailprogramma met een mail naar de maker van de app (geen account nodig); met **Delen op GitHub** een GitHub-issue. Het rapport staat erin, of op je klembord om te plakken als het te lang is, en verschijnt ook onder de knoppen. Er gaat pas iets weg als jij de mail verstuurt of het issue plaatst. Klopt er iets niet in wat het dashboard laat zien, vink dan ook **Mijn dashboard meesturen** aan: dan kan de maker precies zien wat jij ziet. Dan gaan ook de apparaatnamen en het verbruik van vandaag mee.

Heeft je P1-meter geen vermogensmetingen (W) in Insights, dan rekent de app het vermogen voor "Vermogen vandaag" en het sluipverbruik uit met de kWh-tellers van de meter.

## Thuisbatterij

Heb je een thuisbatterij, dan staat er een eigen blok **Thuisbatterij** op het dashboard: het laadniveau, of hij laadt of ontlaadt en met hoeveel vermogen, hoeveel er in de gekozen periode geladen en ontladen is, welk deel met zon geladen is, het laadniveau door de dag heen, en bij Maand of Jaar het rendement. Met meerdere batterijen staat elke batterij er apart bij.

Het blok **Batterijgebruik** laat zien wanneer de batterij laadde (van de zon of het net) en leverde (aan huis of net), wat laden gemiddeld kostte en wat ontladen bespaarde.

Voeg de batterij in Homey toe met de app van je merk (bijvoorbeeld [Zendure Local](https://homey.app/en-us/app/com.tweakers.zendure/Zendure-Local/) voor een Zendure SolarFlow). Het dashboard vindt hem dan vanzelf als hij als batterij bij Homey Energie bekend is. Zo niet, vink hem aan bij de instellingen.

Verder verschijnen:

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

## Batterij kiezen

Het blok rekent per nacht, van 12:00 tot 12:00 de volgende dag, wat het huis verbruikt terwijl de zonnepanelen minder dan 200 W leveren. Het verbruik is wat de slimme meter afneemt plus wat de panelen leveren (min wat een eventuele thuisbatterij laadt). Het zonne-overschot is wat je die dag teruglevert: wat je in een batterij had kunnen laden.

- **Capaciteit voor 4 van de 5 nachten**: de batterijgrootte die in 80% van de nachten genoeg is, rekening houdend met het overschot van die dag.
- **Vermogen voor 90% van dat verbruik**: het vermogen waarmee een batterij 90% van het verbruik in het donker kan leveren.
- **Dekt**: per batterijgrootte het deel van je verbruik in het donker dat de batterij zou leveren, als je hem alleen met je eigen zonnestroom laadt. Laden van het net met een dynamisch contract telt niet mee.

De gegevens komen uit Homey Insights. Bij de eerste keer vult de app zo veel nachten aan als Homey met metingen per uur (of fijner) bewaart; daarna komt er elke dag een nacht bij, tot 365. Het vermogen is een gemiddelde per meetstap (vaak een uur), dus korte pieken zoals een waterkoker vallen weg: kies het vermogen van een batterij liever wat ruimer.

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
