'use strict';

// Homey settings page: links to the dashboard and edits the app settings

const BOILER_FIELDS = ['liters', 'coldWaterTemp', 'showerTemp', 'showerFlow', 'warmFrom'];
const TARIFF_FIELDS = ['electricityImport', 'electricityExport', 'gas'];
const DEFAULT_BOILER = { liters: 80, coldWaterTemp: 10, showerTemp: 40, showerFlow: 8, warmFrom: 50 };

function onHomeyReady(Homey) {
  const form = document.getElementById('settings-form');

  const call = (method, path) => new Promise((resolve, reject) => {
    Homey.api(method, path, null, (err, result) => (err ? reject(err) : resolve(result)));
  });
  const getSetting = key => new Promise((resolve, reject) => {
    Homey.get(key, (err, value) => (err ? reject(err) : resolve(value)));
  });
  const setSetting = (key, value) => new Promise((resolve, reject) => {
    Homey.set(key, value, err => (err ? reject(err) : resolve()));
  });

  loadSettings().finally(() => Homey.ready());

  async function loadSettings() {
    const status = document.getElementById('save-status');
    try {
      const [config = {}, list] = await Promise.all([getSetting('config').then(c => c || {}), call('GET', '/settings-info')]);
      showDashboard(list);
      form.port.value = config.port || 8080;
      const devices = config.devices || {};
      const name = id => list.devices.find(d => d.id === id)?.name;
      const autoLabel = id => `Automatisch${name(id) ? ` (${name(id)})` : ''}`;

      fillSelect(form.p1, list.devices, devices.p1, autoLabel(list.found.p1));
      fillSelect(form.boiler, list.devices, devices.boiler, autoLabel(list.found.boiler));
      fillSelect(form.thermostat, list.devices, devices.thermostat, autoLabel(list.found.thermostat));
      fillSelect(form.water, list.devices, devices.water, autoLabel(list.found.water));
      form.fuseAmps.value = config.grid?.fuseAmps ?? 25;
      form.editPin.value = config.editPin || '';
      form.pricesOn.checked = config.prices?.source !== 'off';
      form.surcharge.value = config.prices?.surcharge ?? 0;
      form['water-tariff'].value = config.tariffs?.water ?? '';
      fillChecks('heating-list', 'heating', list.devices, devices.heating || [],
        d => d.class === 'heatpump' || d.class === 'boiler' || /warmtepomp|heat ?pump|cv|ketel/i.test(d.name),
        'Geen warmtepomp of cv-ketel gevonden');
      fillChecks('ev-list', 'evChargers', list.devices, devices.evChargers || [],
        d => d.class === 'evcharger' || /laadpa|charger|wallbox|easee|zaptec|alfen/i.test(d.name),
        'Geen laadpaal gevonden');
      initLayout(list);

      fillChecks('solar-list', 'solar', list.devices, devices.solar || [],
        d => d.class === 'solarpanel' || /solar|zon|omvormer|inverter|pv/i.test(d.name),
        'Geen zonnepanelen gevonden');
      fillChecks('battery-list', 'batteries', list.devices, devices.batteries || [],
        d => d.class === 'battery' || /batter|zendure|solarflow|accu/i.test(d.name),
        'Nog geen thuisbatterij gevonden. Na het toevoegen van je batterij in Homey verschijnt hij hier vanzelf.');
      form.invertPower.checked = Boolean(config.battery?.invertPower);

      const boiler = { ...DEFAULT_BOILER, ...config.boiler };
      BOILER_FIELDS.forEach(key => { form[key].value = boiler[key]; });
      const tariffs = config.tariffs || {};
      TARIFF_FIELDS.forEach(key => { form[key].value = tariffs[key] ?? ''; });
    } catch (err) {
      status.textContent = `Instellingen laden mislukt: ${err.message || err}`;
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const number = key => (form[key].value === '' ? undefined : Number(form[key].value));
      const config = {
        port: number('port') ?? 8080,
        editPin: form.editPin.value.trim(),
        devices: {
          p1: form.p1.value,
          boiler: form.boiler.value,
          solar: checkedValues('solar'),
          batteries: checkedValues('batteries'),
          heating: checkedValues('heating'),
          thermostat: form.thermostat.value,
          evChargers: checkedValues('evChargers'),
          water: form.water.value,
        },
        grid: { fuseAmps: number('fuseAmps') ?? 25 },
        prices: { source: form.pricesOn.checked ? 'energyzero' : 'off', surcharge: number('surcharge') ?? 0 },
        layout: layoutToSave(),
        battery: { invertPower: form.invertPower.checked },
        boiler: Object.fromEntries(BOILER_FIELDS.map(key => [key, number(key) ?? DEFAULT_BOILER[key]])),
        tariffs: Object.fromEntries([
          ...TARIFF_FIELDS.map(key => [key, number(key)]),
          ['water', number('water-tariff')],
        ].filter(([, v]) => v !== undefined)),
      };
      if (config.boiler.showerTemp <= config.boiler.coldWaterTemp) {
        status.textContent = 'De douchetemperatuur moet hoger zijn dan die van het koude water.';
        return;
      }
      if (config.port < 1024 || config.port > 65535) {
        status.textContent = 'Kies een poort tussen 1024 en 65535.';
        return;
      }
      try {
        await setSetting('config', config);
        status.textContent = 'Opgeslagen';
        // The app restarts the web server on a new port, give it a moment
        setTimeout(() => call('GET', '/settings-info').then(showDashboard).catch(() => {}), 1500);
      } catch (err) {
        status.textContent = `Opslaan mislukt: ${err.message || err}`;
      }
    });
  }

  function showDashboard(info) {
    const link = document.getElementById('dashboard-url');
    link.textContent = info.dashboardUrl;
    link.href = info.dashboardUrl;
    const status = document.getElementById('server-status');
    status.textContent = info.server.running ? 'De webpagina draait.' : `De webpagina draait niet. ${info.server.message || ''}`;
    status.className = info.server.running ? 'muted' : 'error';
  }

  // ---------- Layout ----------

  // All blocks: the shown ones in their order first, then the hidden ones
  let layoutItems = [];
  let layoutCustom = false;

  function layoutFrom(layout, blocks) {
    const shown = layout.map(b => ({ ...b, on: true }));
    const hidden = blocks
      .filter(b => !shown.some(s => s.id === b.id))
      .map(b => ({ id: b.id, size: b.size, on: false }));
    return [...shown, ...hidden].map(b => ({ ...b, title: blocks.find(x => x.id === b.id).title }));
  }

  function initLayout(info) {
    layoutCustom = info.customLayout;
    layoutItems = layoutFrom(info.layout, info.blocks);
    renderLayout();
    document.getElementById('layout-reset').onclick = () => {
      layoutCustom = false;
      layoutItems = layoutFrom(info.defaultLayout, info.blocks);
      renderLayout();
    };
  }

  const SIZE_LABELS = { small: 'Smal', half: 'Half', large: 'Breed', full: 'Volledig' };

  function renderLayout() {
    const list = document.getElementById('layout-list');
    list.innerHTML = layoutItems.map((b, i) => `
      <li class="${b.on ? '' : 'off'}" data-i="${i}">
        <input type="checkbox" data-action="toggle" ${b.on ? 'checked' : ''} aria-label="${escapeText(b.title)} tonen">
        <span class="name">${escapeText(b.title)}</span>
        <select data-action="size" aria-label="Breedte">
          ${Object.entries(SIZE_LABELS).map(([id, label]) => `<option value="${id}" ${b.size === id ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        ${b.rows ? '<button type="button" class="chip" data-action="auto-height" title="De hoogte is op het dashboard ingesteld. Tik om die weer door de inhoud te laten bepalen.">Eigen hoogte ✕</button>' : ''}
        <button type="button" class="move" data-action="up" ${i === 0 ? 'disabled' : ''} aria-label="Omhoog">↑</button>
        <button type="button" class="move" data-action="down" ${i === layoutItems.length - 1 ? 'disabled' : ''} aria-label="Omlaag">↓</button>
      </li>`).join('');
    document.getElementById('layout-mode').textContent = layoutCustom
      ? 'Je gebruikt een eigen indeling.'
      : 'Standaardindeling: blokken verschijnen vanzelf zodra er een passend apparaat is, bijvoorbeeld een thuisbatterij of laadpaal.';
  }

  document.getElementById('layout-list').addEventListener('input', onLayoutChange);
  document.getElementById('layout-list').addEventListener('click', onLayoutChange);

  function onLayoutChange(event) {
    const action = event.target.dataset.action;
    const li = event.target.closest('li');
    if (!action || !li) return;
    if ((action === 'toggle' || action === 'size') && event.type !== 'input') return;
    if ((action === 'up' || action === 'down' || action === 'auto-height') && event.type !== 'click') return;
    const i = Number(li.dataset.i);
    const item = layoutItems[i];
    if (action === 'toggle') item.on = event.target.checked;
    if (action === 'size') item.size = event.target.value;
    if (action === 'auto-height') delete item.rows;
    if (action === 'up' && i > 0) [layoutItems[i - 1], layoutItems[i]] = [layoutItems[i], layoutItems[i - 1]];
    if (action === 'down' && i < layoutItems.length - 1) [layoutItems[i + 1], layoutItems[i]] = [layoutItems[i], layoutItems[i + 1]];
    layoutCustom = true;
    renderLayout();
  }

  // null keeps the automatic layout, which adapts when new devices are added
  function layoutToSave() {
    if (!layoutCustom) return null;
    return layoutItems.filter(b => b.on).map(({ id, size, rows }) => (rows ? { id, size, rows } : { id, size }));
  }

  function checkedValues(name) {
    return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
  }

  // Checkboxes for devices that look like a match; none checked means "find automatically"
  function fillChecks(id, name, devices, selected, looksLike, emptyText) {
    document.getElementById(id).innerHTML = devices
      .filter(d => looksLike(d) || selected.includes(d.id))
      .map(d => `<label class="check"><input type="checkbox" name="${name}" value="${d.id}" ${selected.includes(d.id) ? 'checked' : ''}> ${escapeText(d.name)}</label>`)
      .join('') || `<span class="muted">${escapeText(emptyText)}</span>`;
  }

  function fillSelect(select, devices, selected, autoLabel) {
    select.innerHTML = `<option value="">${escapeText(autoLabel)}</option>`
      + devices.map(d => `<option value="${d.id}" ${d.id === selected ? 'selected' : ''}>${escapeText(d.name)}</option>`).join('');
  }

  function escapeText(text) {
    const span = document.createElement('span');
    span.textContent = text;
    return span.innerHTML;
  }
}
