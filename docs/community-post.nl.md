# [APP][Pro] Energie Dashboard – een live energiescherm voor elk scherm in huis

Hoi allemaal,

Ik heb een app gemaakt die van elk scherm in huis een live energiedashboard maakt. Homey Pro serveert het dashboard als webpagina in je eigen netwerk, dus een tablet aan de muur, een laptop of je telefoon heeft alleen een browser nodig. Je hebt geen extra computer, cloudaccount of API-sleutel nodig. Er zijn ook twee widgets voor de Dashboards van Homey zelf.

**De app staat nu in test en ik zoek testers.** Installeren kan hier:
https://homey.app/a/com.drpeppers.energydashboard/test/

![Dashboard in donkere modus](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/dashboard-dark.png)

## Nieuw in 0.2.0

Bedankt voor de eerste feedback! Deze versie voegt toe:

- **Prijzen uit Homey Energie, voor elk land.** Heb je in Homey dynamische prijzen ingesteld (Energie → Instellingen), dan gebruikt het dashboard die, inclusief de kostenformule die je daar invulde, zodat de all-in prijs gelijk is aan die van Homey. Bedragen staan in de valuta van Homey. In Nederland werkt EnergyZero nog zoals voorheen.
- **Maandpiek (Belgisch capaciteitstarief).** Een nieuw blok met je hoogste kwartiervermogen van deze maand, het lopende kwartier, de afgelopen 12 maanden en wat het kost met jouw tarief. Het gebruikt de piek van de meter zelf als je P1-app die doorgeeft (HomeWizard doet dat), en meet anders zelf elk kwartier. Komt het lopende kwartier boven je maandpiek, dan verschijnt er een melding.
- **Batterijgebruik.** Wat je thuisbatterij per uur, dag of maand opsloeg en leverde, van de zon of het net, wat laden gemiddeld kostte en ontladen bespaarde. Per dag staat elke sessie erbij: wanneer hij laadde of leverde, en tegen welke prijs.
- **Fasen door de dag**: L1, L2 en L3 in één grafiek, met je hoofdzekering als stippellijn.
- **Apparaten met een schatting in Homey** (zoals lampen) staan nu bij "Apparaten nu", "Verbruik per apparaat" en in de energiestromen, gemarkeerd als geschat.
- **Meer dakvlakken** voor de zonneverwachting: er staan er twee klaar, tot tien kan.
- **Een melding bij een negatieve prijs** terwijl je teruglevert, zodat je iets kunt aanzetten of de panelen kunt terugregelen.
- **De kWh van vandaag in de widget "Energie nu"**, in plaats van of naast het vermogen van dit moment.
- **Tien talen**: Nederlands, Engels, Duits, Noors, Zweeds, Deens, Italiaans, Frans, Portugees en Spaans.
- **Meer thuisbatterijen**: batterijen die laad- en ontlaadvermogen apart doorgeven (zoals Indevolt) tonen nu hun vermogen, zodat laden er niet meer uitziet als afname van het net. Bedankt @MWeijland! Ook Enphase IQ Battery wordt gevonden, batterijen die het vermogen andersom doorgeven worden herkend aan hun laadstatus, en een groep stekkerbatterijen geeft niet langer de melding "dezelfde batterij twee keer".

## Uitgelicht: zie waar elke kWh heen gaat

Het blok waar ik zelf het meest blij mee ben is **Energiestromen**, een Sankey-diagram. In één beeld zie je waar je energie vandaan komt, waar hij heen gaat en welke apparaten hem gebruiken. De dikte van elke band is de hoeveelheid energie, dus de grootverbruikers springen er meteen uit.

- **Links:** de bronnen: zon, net en thuisbatterij.
- **Midden:** je huis, plus wat er weer uit ging: teruggeleverd aan het net en geladen in de batterij. Zo zie je in één oogopslag hoeveel van je zonnestroom je zelf gebruikt hebt.
- **Rechts:** elk apparaat met een energiemeter in Homey, van laadpaal en warmtepomp tot koelkast en netwerkkast. Wat de apparaten niet verklaren staat als **Niet gemeten**, zodat de getallen altijd kloppen en je ziet hoeveel er nog onbekend is.

Er zijn twee standen. **Live** toont het vermogen op dit moment in watt, met deeltjes die langs de banden stromen. **Periode** toont de energie in kWh voor vandaag, gisteren, de week, de maand of het jaar. Wijs een band aan om de precieze waarde te zien.

![Energiestromen, live](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/energy-flows.png)

![Energiestromen, deze maand](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/energy-flows-month.png)

Over een maand vind je hier de verrassingen: de koelkast die net zoveel gebruikt als de wasmachine, of hoeveel van je zonnestroom in de auto belandt.

## Wat het verder laat zien

Het dashboard bestaat uit blokken die je zelf indeelt: versleep ze, pas de breedte en hoogte aan, of verberg ze. Blokken voor een thuisbatterij, laadpaal of warmtepomp verschijnen vanzelf zodra Homey een passend apparaat heeft.

**Energie nu**: de live stroom tussen zon, net, huis en thuisbatterij. Bewegende deeltjes laten zien waar de stroom heen gaat; bij meer vermogen gaan ze sneller.

![Energie nu](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/energy-now.png)

**Vermogen vandaag**: het vermogen door de dag heen, in de stijl van de HomeWizard-app. Zonnestroom die je zelf gebruikte staat onderaan. Afname van het net ligt daarbovenop, dus de bovenrand is je verbruik. Teruglevering ligt er op dezelfde manier bovenop, dus die bovenrand is alles wat je panelen opwekten. Wijs de grafiek aan voor de waarden op dat moment. Met de zonneverwachting aan toont een stippellijn het verwachte zonnevermogen. Dit werkt ook voor P1-meters die geen vermogen in Insights vastleggen: de app berekent het dan uit de meterstanden.

![Vermogen vandaag](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/power-chart.png)

**Kosten, met je eigen contract**: een vast contract (normaal- en daltarief) of een dynamisch contract. Bij een dynamisch contract is de prijs per kwartier de marktprijs plus energiebelasting plus de opslag van je leverancier. Je kunt een van negentien leveranciers kiezen om de gebruikelijke opslag in te vullen, maar controleer de bedragen wel op je eigen contract. De kosten worden berekend met de prijs van elk kwartier, zodat ze kloppen met een dynamisch contract. Het blok toont afname, teruglevering, gas, water en vaste kosten, vergeleken met de vorige periode.

**Afname en teruglevering hebben elk hun eigen prijs.** Het Energie-tabblad van Homey rekent met één prijsformule voor allebei, maar vanaf 2027 verschillen ze: over afname betaal je energiebelasting, over teruglevering niet. Het dashboard rekent afname met de marktprijs plus energiebelasting en opslag, en teruglevering na salderen met alleen je terugleververgoeding (of de marktprijs), min eventuele terugleverkosten. Zo blijven de bedragen ook na 2027 kloppen.

![Kosten](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/costs.png)

![Prijzen](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/prices.png)

**Einde salderen**: salderen stopt op 1 januari 2027. Op basis van je eigen gegevens van het afgelopen jaar laat dit blok zien wat dat je ongeveer per jaar gaat kosten, en wat elke kWh oplevert die je zelf gebruikt in plaats van teruglevert.

![Einde salderen](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/netting.png)

**Thuisbatterij**: laadniveau, geladen en ontladen energie, hoeveel er van de zon kwam, en wat de batterij je oplevert, met en zonder salderen.

![Thuisbatterij](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/battery.png)

**Zonne-energie**: de opbrengst per dag, week, maand of jaar tegenover de verwachting, met de prestatie, opbrengst per kWp, de beste dag en een regel per omvormer.

![Zonne-energie](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/solar.png)

**Meldingen**: apparaten die langer aan staan dan je zou verwachten, en sluipverbruik dat hoger is dan normaal. Desgewenst ook in de Homey-tijdlijn, hooguit één keer per dag per melding.

![Meldingen](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/alerts.png)

En verder:
- Totalen per dag, week, maand of jaar: verbruik, afname, zon, teruglevering, gas, water, zelfvoorziening en kosten, vergeleken met de vorige periode
- Grafieken voor elektriciteit, gas en water; gas ook per graaddag, zodat een koude maand er niet uitziet als een slechte maand
- Warm water: temperatuur en geschatte douche-minuten van je boiler (gemaakt met de Atag Lydos Hybrid in gedachten)
- Verwarming en laadpaal
- Verbruik per apparaat, sluipverbruik en fasebelasting
- Maandpiek voor het Belgische capaciteitstarief, en batterijgebruik door de tijd
- De gekozen periode exporteren als CSV

Het werkt in lichte en donkere modus, op elk schermformaat, in tien talen (kiezen rechtsboven).

![Lichte modus](https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/dashboard-light.png)

<img src="https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/phone-nl.png" alt="Op een telefoon" width="300">

## Widgets voor Homey Dashboards

**Energiestromen** laat live zien waar je stroom vandaan komt, welke ruimtes hem gebruiken en welke apparaten per ruimte het meest verbruiken. **Energie nu** is een compacte versie van de live stroom tussen zon, net, huis en batterij, met het vermogen van nu, de kWh van vandaag, of allebei. Beide zijn licht gehouden: Homey stuurt alleen een kort lijstje waarden en de widget tekent ze zelf.

<img src="https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/widget.png" alt="Widget Energiestromen" width="400"> <img src="https://raw.githubusercontent.com/WNijhof/homey-energy-dashboard/main/docs/screenshots/widget-now.png" alt="Widget Energie nu" width="400">

## Voor een tablet aan de muur

- Elk scherm kan een eigen indeling hebben: sla een indeling op onder een naam en open het dashboard met `?indeling=<naam>` achter het adres.
- Zet het dashboard op het beginscherm van een tablet of telefoon om het als app te openen, zonder browserbalk.
- Met het schermicoon rechtsboven: volledig scherm, scherm aan houden, en nachtstand (het scherm dimmen of zwart maken tussen twee tijden; een tik maakt het een minuut wakker).

De pagina schuift af en toe een paar pixels tegen inbranden, en herlaadt zichzelf na een app-update.

## Hoe het werkt

- Apparaten worden automatisch gevonden via Homey Energy: een P1-meter, zonnepanelen, een thuisbatterij, een boiler, verwarming, een laadpaal en een watermeter. Je kunt ze ook zelf kiezen in de instellingen van de app.
- De geschiedenis komt uit Homey Insights. Marktprijzen komen van Homey Energie, of van EnergyZero voor Nederland; de zonneverwachting van Forecast.Solar en de buitentemperatuur voor graaddagen van Open-Meteo (allemaal gratis, zonder account). Niets over je verbruik verlaat je netwerk.
- De instellingen van de app tonen het adres van het dashboard (standaard `http://<homey-ip>:8080`).
- Beveilig het dashboard met een toegangscode, en het bewerken van de indeling met een pincode. Stel zeker een toegangscode in als je het dashboard van buiten je huis bereikbaar maakt.

## Vereisten

- Homey Pro met Homey 12.3 of nieuwer
- Een P1-meter voor de live- en vermogensweergaven; zonnepanelen, een batterij en de andere apparaten zijn optioneel
- Dynamische prijzen uit Homey Energie (elk land dat Homey kent) of van EnergyZero (Nederland); de leverancierslijst en energiebelasting in de instellingen zijn Nederlands

## Feedback

Dit is een testversie, dus ik hoor graag hoe het werkt met jouw apparaten, vooral andere P1-meters, omvormers, thuisbatterijen en laadpalen. Wordt iets niet gevonden of ziet het er niet goed uit? Laat het hier weten of maak een issue aan op GitHub:
https://github.com/WNijhof/homey-energy-dashboard/issues

Broncode: https://github.com/WNijhof/homey-energy-dashboard
