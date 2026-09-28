'use strict';

// Language of the dashboard. The page and dashboard.js are written in Dutch; in English every
// text the page shows is translated here as it appears: whole texts from WORDS, texts with a
// number or name in them from PATTERNS. The choice is kept per screen and, the first time,
// follows the language of the browser. Edit this file in /shared and run `npm run sync`.

(function () {

  const KEY = 'energy-dashboard-lang';
  let lang = null;
  try { lang = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
  if (lang !== 'nl' && lang !== 'en') lang = /^nl\b/i.test(navigator.language || '') ? 'nl' : 'en';

  const WORDS = {
    // Page
    'Energie': 'Energy',
    'Verbinden…': 'Connecting…',
    'Vandaag': 'Today',
    'Gisteren': 'Yesterday',
    'Week': 'Week',
    'Maand': 'Month',
    'Deze week': 'This week',
    'Deze maand': 'This month',
    'vandaag': 'today',
    'gisteren': 'yesterday',
    'deze week': 'this week',
    'deze maand': 'this month',
    'Periode': 'Period',
    'Taal': 'Language',
    'Demo': 'Demo',
    'Live': 'Live',
    'Geen verbinding': 'No connection',
    'Kan geen gegevens ophalen.': 'Cannot load data.',
    'Laden…': 'Loading…',
    'Nog geen gegevens voor deze periode': 'No data for this period yet',

    // Edit mode
    'Indeling bewerken': 'Edit layout',
    'Sleep': 'Drag',
    'om een blok te verplaatsen. Sleep de rand rechts voor de breedte en de rand onder voor de hoogte.':
      'to move a block. Drag the right edge for the width and the bottom edge for the height.',
    'Standaard': 'Default',
    'Annuleren': 'Cancel',
    'Opslaan': 'Save',
    'Opslaan…': 'Saving…',
    'Pincode': 'PIN',
    'Toevoegen:': 'Add:',
    'Hoogte auto': 'Auto height',
    'Hoogte weer laten bepalen door de inhoud': 'Let the content decide the height again',
    'Verplaatsen': 'Move',
    'Verbergen': 'Hide',
    'Sleep om de breedte te veranderen': 'Drag to change the width',
    'Sleep om de hoogte te veranderen': 'Drag to change the height',
    'hele breedte': 'full width',
    'Weergave': 'View',

    // Block titles (also sent by the server)
    'Nu': 'Now',
    'Energie nu': 'Energy now',
    'Warm water': 'Hot water',
    'Verwarming': 'Heating',
    'Laadpaal': 'EV charger',
    'Totalen': 'Totals',
    'Stroomprijs': 'Electricity price',
    'Kengetallen': 'Key figures',
    'Elektriciteit': 'Electricity',
    'Vermogen vandaag': 'Power today',
    'Apparaten nu': 'Devices now',
    'Energiestromen': 'Energy flows',
    'Verbruik per apparaat': 'Use per device',
    'Kosten': 'Costs',
    'Zonne-energie': 'Solar energy',
    'Gas': 'Gas',
    'Water': 'Water',
    'Sluipverbruik': 'Standby use',
    'Fasebelasting': 'Phase load',

    // Energy now
    'Actuele energiestroom': 'Current energy flow',
    'Zon': 'Solar',
    'Net': 'Grid',
    'Huis': 'Home',
    'Batterij': 'Battery',
    'terug': 'export',
    'afname': 'import',
    'laden': 'charging',
    'ontladen': 'discharging',

    // Hot water
    'Geen boiler gevonden. Kies er een bij de instellingen.': 'No water heater found. Choose one in the settings.',
    'doucheminuten': 'shower minutes',
    'Douchebeurten': 'Showers',
    'Ingesteld': 'Target',
    'Opwarmen': 'Heating up',
    'Warm': 'Hot',
    'Lauw': 'Lukewarm',
    'Koud': 'Cold',
    'Onbekend': 'Unknown',
    'Watertemperatuur': 'Water temperature',
    'Boilertemperatuur': 'Water heater temperature',
    'Boiler': 'Water heater',
    'Uit': 'Off',
    'Aan': 'On',
    'Niet beschikbaar': 'Unavailable',
    'Ja': 'Yes',
    'Nee': 'No',

    // Modes and states (sent by the server)
    'Programma': 'Program',
    'Elektrisch': 'Electric',
    'Prestatie': 'Performance',
    'Hoog verbruik': 'High demand',
    'Warmtepomp': 'Heat pump',
    'Automatisch': 'Automatic',
    'Verwarmen': 'Heating',
    'Koelen': 'Cooling',
    'Laden': 'Charging',
    'Ontladen': 'Discharging',
    'Gepauzeerd': 'Paused',
    'Aangesloten': 'Plugged in',
    'Niet aangesloten': 'Not plugged in',
    'Niet aan het laden': 'Not charging',

    // Heating and EV charger
    'Geen warmtepomp, cv-ketel of thermostaat gevonden. Kies ze bij de instellingen.':
      'No heat pump, central heating boiler or thermostat found. Choose them in the settings.',
    'Geen laadpaal gevonden. Kies er een bij de instellingen.': 'No EV charger found. Choose one in the settings.',
    'Laadpalen': 'EV chargers',
    'aan het laden': 'charging',
    'vermogen': 'power',
    'Accu auto': 'Car battery',

    // Totals and charts
    'Verbruik': 'Consumption',
    'Van het net': 'From grid',
    'Zon opgewekt': 'Solar produced',
    'Terug': 'Export',
    'Teruggeleverd': 'Exported',
    'Teruglevering': 'Export',
    'Zelf': 'Self',
    'Zelfvoorzienend': 'Self-sufficient',
    'Geladen': 'Charged',
    'Batterij geladen': 'Battery charged',
    'Batterij ontladen': 'Battery discharged',
    'Batterij laden': 'Battery charging',
    'Eigen zon gebruikt': 'Own solar used',
    'Zon direct': 'Solar direct',
    'Uit batterij': 'From battery',
    'Zon in batterij': 'Solar to battery',
    'Zelfverbruik': 'Self-consumption',
    'Opgewekt': 'Produced',
    'Stroom verwarming': 'Heating electricity',
    '= gelijk': '= same',
    'vorige periode': 'previous period',
    'gisteren tot hetzelfde uur': 'yesterday up to the same hour',
    'vorige week tot dezelfde dag': 'last week up to the same day',
    'vorige maand tot dezelfde dag': 'last month up to the same day',
    'Geen vermogensgegevens van de P1-meter': 'No power data from the P1 meter',

    // Energy flows
    'nu · W': 'now · W',
    'Nu geen energiestroom gemeten': 'No energy flow measured right now',
    'Niet gemeten': 'Not measured',
    'Energiestromen van bron naar verbruiker': 'Energy flows from source to consumer',

    // Prices
    'Geen prijzen beschikbaar.': 'No prices available.',
    'per kWh nu': 'per kWh now',
    'Laagste vandaag': 'Lowest today',
    'Hoogste vandaag': 'Highest today',
    'Gemiddeld vandaag': 'Average today',
    'morgen': 'tmrw',
    'Prijzen ophalen duurde te lang': 'Loading prices took too long',

    // Key figures, devices, costs
    'kWh netto geleverd': 'kWh net exported',
    'kWh netto afgenomen': 'kWh net imported',
    'Geen apparaten met een kWh-meter gevonden': 'No devices with a kWh meter found',
    'Geen apparaten met stroommeting actief': 'No devices with power metering active',
    'Vul je tarieven in bij de instellingen om de kosten te zien.': 'Enter your tariffs in the settings to see the costs.',
    'Stroom afname': 'Electricity import',
    'Totaal': 'Total',

    // Water, standby use, phases
    'Geen watermeter gevonden. Kies er een bij de instellingen.': 'No water meter found. Choose one in the settings.',
    'vannacht': 'last night',
    'Nog niet bekend. Dit wordt berekend uit het verbruik van afgelopen nacht.': 'Not known yet. This is calculated from last night\'s use.',
    'altijd aan': 'always on',
    'Per jaar': 'Per year',
    'Kost per jaar': 'Cost per year',
    'Gemeten': 'Measured',
    'vannacht 1:00–5:00': 'last night 1:00–5:00',
    'Je slimme meter geeft geen waarden per fase door.': 'Your smart meter does not report values per phase.',

    // Messages
    'P1-meter': 'P1 meter',
    'zonnepanelen': 'solar panels',
    'boiler': 'water heater',
    'Demo-modus.': 'Demo mode.',
    'Je ziet voorbeelddata. Vul': 'You are looking at sample data. Fill in',
    'in met het adres en de API-key van je Homey Pro en start de server opnieuw.': 'with the address and API key of your Homey Pro and restart the server.',
    'Zet de apparaat-id\'s in': 'Put the device IDs in',
    '(zie': '(see',
    'Kies ze in de Homey-app bij': 'Choose them in the Homey app under',
    'Apps → Energie Dashboard → Instellingen': 'Apps → Energy Dashboard → Settings',
    'Kies minstens één blok': 'Choose at least one block',
    'Verkeerde pincode': 'Wrong PIN',
    'Te veel verkeerde pincodes. Probeer het over een minuut opnieuw.': 'Too many wrong PINs. Try again in a minute.',
    'Te veel gegevens': 'Too much data',
    'Ongeldige gegevens': 'Invalid data',
    'Ongeldig adres': 'Invalid address',
    'Niet gevonden': 'Not found',
    'Toegangscode nodig': 'Access code required',
  };

  const PERIOD = '(vandaag|gisteren|deze week|deze maand)';
  const word = text => WORDS[text] ?? text;
  const list = text => text.split(', ').map(word).join(', ');

  const PATTERNS = [
    [/^af (.+) · terug (.+) kWh$/, (_, a, b) => `import ${a} · export ${b} kWh`],
    [/^in (.+) · uit (.+) kWh$/, (_, a, b) => `in ${a} · out ${b} kWh`],
    [/^Batterij (\d+%)$/, (_, soc) => `Battery ${soc}`],
    [/^kWh = vandaag · (.+)$/, (_, time) => `kWh = today · ${time}`],
    [/^bijgewerkt (.+)$/, (_, time) => `updated ${time}`],
    [/^Doucheminuten zijn een schatting: (.+) L boiler, douchen op (.+) °C met (.+) L\/min\.$/,
      (_, liters, temp, flow) => `Shower minutes are an estimate: ${liters} L tank, showering at ${temp} °C with ${flow} L/min.`],
    [/^(.*) · ingesteld (.+)$/, (_, name, temp) => `${name} · set to ${temp}`],
    [new RegExp(`^Stroom ${PERIOD}$`), (_, p) => `Electricity ${word(p)}`],
    [new RegExp(`^Gas ${PERIOD} \\(hele huis\\)$`), (_, p) => `Gas ${word(p)} (whole house)`],
    [new RegExp(`^Geladen ${PERIOD}$`), (_, p) => `Charged ${word(p)}`],
    [/^Accu (.+)$/, (_, name) => `Battery ${name}`],
    [/^t\.o\.v\. (.+)$/, (_, what) => `compared to ${word(what)}`],
    [/^(.+) · kWh$/, (_, what) => `${word(what)} · kWh`],
    [/^Vermogen (vandaag|gisteren)$/, (_, day) => `Power ${word(day)}`],
    [/^(vandaag|gisteren) · verbruik (.+) kWh · zon (.+) kWh$/, (_, day, use, sun) => `${word(day)} · consumption ${use} kWh · solar ${sun} kWh`],
    [/^(vandaag|gisteren) · verbruik (.+) kWh$/, (_, day, use) => `${word(day)} · consumption ${use} kWh`],
    [/^(\d\d:\d\d) · verbruik (.+) · zon (.+)$/, (_, time, use, sun) => `${time} · consumption ${use} · solar ${sun}`],
    [/^(\d\d:\d\d) · verbruik (.+)$/, (_, time, use) => `${time} · consumption ${use}`],
    [/^Geen prijzen: (.+)$/, (_, why) => `No prices: ${translate(why)}`],
    [/^Prijzen niet beschikbaar \((.+)\)$/, (_, code) => `Prices not available (${code})`],
    [/^(.+) · incl\. btw( \+ opslag)?$/, (_, source, extra) => `${source} · incl. VAT${extra ? ' + surcharge' : ''}`],
    [/^Goedkoopste 1 uur$/, () => 'Cheapest hour'],
    [/^Goedkoopste (\d+) uur$/, (_, hours) => `Cheapest ${hours} hours`],
    [/^morgen (.+)$/, (_, time) => `tomorrow ${time}`],
    [/^(.*)nu ([\d.,]+ L\/min)$/, (_, before, flow) => `${before}now ${flow}`],
    [/^hoofdzekering (.+) A$/, (_, amps) => `main fuse ${amps} A`],
    [/^vorige periode (.+)$/, (_, amount) => `previous period ${amount}`],
    [/^Bewerken lukt niet: (.+)$/, (_, why) => `Cannot edit: ${translate(why)}`],
    [/^\+ (.+)$/, (_, title) => `+ ${word(title)}`],
    [/^Niet gevonden: (.+)\.$/, (_, what) => `Not found: ${list(what)}.`],
    [/^Onbekend blok: (.+)$/, (_, id) => `Unknown block: ${id}`],
    [/^Onbekende breedte: (.+)$/, (_, size) => `Unknown width: ${size}`],
    [/^Onbekende hoogte: (.+)$/, (_, rows) => `Unknown height: ${rows}`],
    [/^(.+) → (.+): (.+)$/, (_, from, to, value) => `${word(from)} → ${word(to)}: ${value}`],
    [/^(.+): ([\d.,]+ k?Wh?)$/, (_, name, value) => `${word(name)}: ${value}`],
    [/^Fout (\d+)$/, (_, code) => `Error ${code}`],
    [/^Homey gaf (\d+) op (.+)$/, (_, code, rest) => `Homey returned ${code} for ${rest}`],
  ];

  // Translates one text, keeping the white space around it
  function translate(text) {
    if (lang === 'nl' || !text) return text;
    const core = text.trim();
    if (!core || !/[a-z]/i.test(core)) return text;
    let out = WORDS[core];
    if (out === undefined) {
      for (const [pattern, replace] of PATTERNS) {
        if (pattern.test(core)) {
          out = core.replace(pattern, replace);
          break;
        }
      }
    }
    if (out === undefined || out === core) return text;
    return text.replace(core, out);
  }

  const ATTRIBUTES = ['title', 'aria-label', 'placeholder'];

  function translateAttributes(el) {
    for (const name of ATTRIBUTES) {
      const value = el.getAttribute(name);
      if (value === null) continue;
      const out = translate(value);
      if (out !== value) el.setAttribute(name, out);
    }
  }

  function translateText(node) {
    const out = translate(node.nodeValue);
    if (out !== node.nodeValue) node.nodeValue = out;
  }

  function translateTree(root) {
    if (root.nodeType === Node.TEXT_NODE) return translateText(root);
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) {
      if (root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return;
      translateAttributes(root);
      if (root.tagName === 'TEMPLATE') translateTree(root.content);
    }
    for (const child of root.childNodes) translateTree(child);
  }

  // A choice between NL and EN in the header; the page loads again in the chosen language
  function addSwitch() {
    const actions = document.querySelector('.header-actions');
    if (!actions) return;
    const nav = document.createElement('nav');
    nav.className = 'segmented lang-switch';
    nav.setAttribute('aria-label', lang === 'nl' ? 'Taal' : 'Language');
    nav.innerHTML = ['nl', 'en'].map(code =>
      `<button type="button" data-lang="${code}" class="${code === lang ? 'active' : ''}">${code.toUpperCase()}</button>`).join('');
    nav.addEventListener('click', event => {
      const button = event.target.closest('button[data-lang]');
      if (!button || button.dataset.lang === lang) return;
      try { localStorage.setItem(KEY, button.dataset.lang); } catch { /* storage unavailable */ }
      location.reload();
    });
    actions.insertBefore(nav, actions.firstChild);
  }

  function start() {
    document.documentElement.lang = lang;
    addSwitch();
    if (lang === 'nl') return;
    document.title = translate(document.title);
    translateTree(document.body);
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') translateText(record.target);
        else if (record.type === 'attributes') translateAttributes(record.target);
        else record.addedNodes.forEach(translateTree);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
  }

  window.EnergyI18n = {
    lang,
    locale: lang === 'nl' ? 'nl-NL' : 'en-GB',
    translate,
    start,
  };

})();
