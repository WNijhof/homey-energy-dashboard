# Energie dashboard voor Homey Pro

> **Aanbevolen: de Homey-app in [`homey-app/`](homey-app/README.md).** Die draait de webpagina op je Homey Pro zelf (`http://<ip-van-je-homey>:8080`) en heeft geen aparte computer of API-key nodig.
>
> Deze map bevat ook een losse versie die op een pc draait (hieronder beschreven). Die dient vooral als testomgeving met voorbeelddata. Na wijzigingen in `shared/` of `lib/energy.js` voer je `npm run sync` uit.

Een energiedashboard in de stijl van de Homey-app, met hetzelfde soort overzicht als het energy dashboard van Home Assistant:

- **Nu**: live energiestroom tussen zon, net en huis
- **Boiler (Atag Lydos)**: watertemperatuur, of hij warm is, geschatte doucheminuten, douchebeurten volgens de Lydos, opwarmen, modus en temperatuurverloop van vandaag
- **Totalen** per dag, week, maand of jaar: verbruik, van het net, zon opgewekt, teruggeleverd, gas, zelfvoorzienend %, eigen zonverbruik % en kosten
- **Vermogen vandaag**: een lijngrafiek van het vermogen door de dag, met zelfverbruik, afname van het net en teruglevering
- **Grafieken** per uur of dag voor elektriciteit, zonne-energie en gas
- **Energiestromen**: een Sankey-grafiek zoals in Home Assistant, van de bronnen (zon, net, batterij) via het huis naar de individuele verbruikers, live of voor de gekozen periode
- **Thuisbatterij**: laden, ontladen en laadniveau, zodra je er een hebt (zie hieronder)
- **Apparaten nu**: wat er op dit moment het meeste stroom gebruikt

Het werkt automatisch in licht en donker, en ook op telefoon of tablet. Rechtsboven kies je de taal: Nederlands, Engels, Duits, Noors, Zweeds, Deens, Italiaans, Frans, Portugees of Spaans.

## Wat je nodig hebt

- Een computer die aan blijft staan in je thuisnetwerk (pc, laptop, NAS of Raspberry Pi) met [Node.js](https://nodejs.org) 18 of nieuwer
- Een Homey Pro met P1-meter, zonnepanelen en de Lydos Hybrid-app

Er hoeft niets geïnstalleerd te worden met `npm install`: er zijn geen extra pakketten.

## Installeren

1. **Maak een API-key in Homey.** Ga naar [my.homey.app](https://my.homey.app), kies je Homey en ga naar *Instellingen → API Keys → Nieuwe API Key*. Geef hem een naam (bijvoorbeeld "Dashboard") en vink alleen **Apparaten bekijken**, **Insights bekijken** en **Energie bekijken** aan (dat laatste voor de prijzen en geschatte apparaten van Homey Energie). Kopieer de key.
2. **Zoek het IP-adres van je Homey.** Dat staat in de Homey-app onder *Instellingen → Algemeen*, of in je router.
3. **Maak `config.json`.** Kopieer `config.example.json` naar `config.json` en vul `address` en `token` in:
   ```json
   "homey": {
     "address": "http://192.168.1.50",
     "token": "jouw-api-key"
   }
   ```
4. **Start het dashboard.** Dubbelklik op `start.bat`, of voer `node server.js` uit.
5. Open **http://localhost:8080** op dezelfde computer, of `http://<ip-van-die-computer>:8080` op je tablet of telefoon.

Zonder `config.json` (of met de voorbeeld-key) draait het dashboard in **demo-modus** met voorbeelddata.

Kreeg je een diagnose van een gebruiker met **Mijn dashboard meesturen**, bewaar die dan als bestand en start `node server.js --snapshot=rapport.json`. Het dashboard toont dan precies wat die gebruiker zag, als **momentopname** (alleen de periode Vandaag).

## Instellingen in `config.json`

| Instelling | Uitleg |
|---|---|
| `port` | Poort van het dashboard (standaard 8080) |
| `devices.p1`, `devices.solar`, `devices.boiler` | Laat leeg om automatisch te zoeken. Worden je apparaten niet gevonden, open dan `http://localhost:8080/api/devices` en zet de juiste `id` hier neer (`solar` is een lijst, voor meerdere omvormers) |
| `boiler.liters` | Inhoud van je boiler (Lydos Hybrid: 80 of 110 liter) |
| `boiler.coldWaterTemp` | Temperatuur van het koude leidingwater (ongeveer 10 °C) |
| `boiler.showerTemp` | Temperatuur waarop je doucht (ongeveer 38–40 °C) |
| `boiler.showerFlow` | Liters per minuut van je douchekop (spaardouche ongeveer 6–7, normaal 8–10) |
| `boiler.warmFrom` | Vanaf deze temperatuur staat de boiler op "Warm" |
| `grid.fuseAmps` | Hoofdzekering per fase, voor het blok Fasebelasting |
| `grid.capacityTariff`, `grid.capacityMin` | Voor het Belgische capaciteitstarief: € per kW per jaar en het minimum per maand (standaard 2,5 kW), voor het blok Maandpiek |
| `prices` | `source`: `"auto"` (Homey Energie als daar dynamische prijzen staan, anders EnergyZero), `"homey"`, `"energyzero"` of `"off"`. Prijzen uit Homey vragen een API-key die ook **Energie bekijken** mag |
| `contract` | Stroom (`electricity`: `type` `"fixed"` met `normal`, `low`, `export`, of `"dynamic"` met `markup`, `energyTax`, `netting`, `exportFee`), gas (`gas`: `type` `"fixed"` met `price`, of `"dynamic"` met `markup`, `energyTax`), `water` (€/m³), `monthly` (vaste kosten per maand) en `taxReduction` (per jaar). Alles inclusief btw; zie `config.example.json` en *Prijzen en kosten* in `homey-app/README.md`. Het oude blok `tariffs` werkt nog |
| `forecast` | Zonneverwachting: `enabled`, `lat`, `lon` en `planes`: een lijst met `kwp`, `tilt` (0–90) en `azimuth` (0 = zuid, -90 = oost, 90 = west), zoveel dakvlakken als je hebt |
| `editPin` | Optionele pincode voor het bewerken van de indeling op het dashboard |
| `layout` | `null` voor de automatische indeling, of een lijst zoals `[{ "id": "flow", "size": "half", "rows": 20 }, …]`. `rows` is optioneel: de hoogte in rijen van 24 pixels. Blokken en breedtes staan in `homey-app/README.md`. Je kunt de indeling ook op het dashboard aanpassen met het potlood; die wordt dan hier opgeslagen |

## Thuisbatterij

Het dashboard is voorbereid op een thuisbatterij, zoals de Zendure SolarFlow 2400 AC. Voeg de batterij in Homey toe (bijvoorbeeld met de app [Zendure Local](https://homey.app/en-us/app/com.tweakers.zendure/Zendure-Local/)). Het dashboard vindt hem dan vanzelf als hij als batterij bij Homey Energie bekend is. Zo niet, vink hem aan bij de instellingen.

Daarna verschijnen:

- een **batterij** onder in "Nu", met laadniveau en of hij laadt of ontlaadt;
- tegels voor **geladen** en **ontladen** kWh;
- in de elektriciteitsgrafiek **"Uit batterij"** boven de nul en **"Batterij geladen"** onder de nul;
- de batterij als bron en bestemming in de **Energiestromen**.

Zelfvoorzienend telt energie uit de batterij mee, net als in Home Assistant. Staan laden en ontladen omgedraaid, zet dan **"Batterij meet vermogen andersom"** aan.

## Energiestromen (Sankey)

Met **Live** en **Periode** bovenin het blok kies je tussen het vermogen van dit moment (in watt, met bewegende stromen) en de kWh van de gekozen periode.

De grafiek toont:

1. **Bronnen**: zon, net en batterij.
2. **Bestemmingen**: het huis, teruglevering en het laden van de batterij.
3. **Verbruikers**: vanuit het huis per apparaat.

Apparaten verschijnen hier als ze een kWh-meter hebben, bijvoorbeeld slimme stekkers. Wat niet per apparaat gemeten wordt, staat bij **Niet gemeten**. Apparaten met minder dan 1,5% van het verbruik tellen ook mee bij Niet gemeten, en er worden maximaal 15 verbruikers getoond.

Let op: meet een apparaat een groep van andere gemeten apparaten (bijvoorbeeld een tussenmeter op een groep), dan telt dat verbruik dubbel.

## Hoe de doucheminuten berekend worden

Heet water uit de boiler wordt in de douche gemengd met koud water. Hoe heter de boiler, hoe meer douchewater je krijgt:

```
liters douchewater = boilerinhoud × (T_boiler − T_koud) / (T_douche − T_koud)
doucheminuten      = liters douchewater / liters per minuut
```

Voorbeeld: 80 L op 55 °C, koud water 10 °C, douchen op 40 °C en 8 L/min geeft 80 × 45 / 30 = 120 L, dus ongeveer 15 minuten.

Dit is een schatting: de Lydos meet de temperatuur op één plek in de tank, en het water is niet overal even warm. Het aantal **douchebeurten** komt rechtstreeks van de Lydos zelf.

## Waar de gegevens vandaan komen

- **Live waarden** komen van de apparaten in Homey en worden elke 10 seconden ververst.
- **Totalen en grafieken** komen uit Homey Insights: de meterstanden van je P1-meter en omvormer. Ze worden elke minuut ververst.
- De API-key blijft op de computer waarop de server draait en gaat nooit naar de browser. Het dashboard leest alleen gegevens en kan niets aan je apparaten veranderen.

## Problemen oplossen

- **"Homey weigert de API-key"**: controleer de key en of die Apparaten en Insights mag bekijken.
- **"Homey is niet bereikbaar"**: klopt het IP-adres? Geef je Homey eventueel een vast IP-adres in je router.
- **Grafieken blijven leeg**: controleer of Insights aan staat voor de energiemeters van de P1-meter (*Apparaat → Instellingen → Insights*).
- **Tablet kan het dashboard niet openen**: sta Node.js toe in de Windows Firewall voor privénetwerken.
