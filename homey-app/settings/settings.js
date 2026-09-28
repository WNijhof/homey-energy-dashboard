'use strict';

// Homey settings page: links to the dashboard and edits the app settings

const BOILER_FIELDS = ['liters', 'coldWaterTemp', 'showerTemp', 'showerFlow', 'warmFrom'];
const DEFAULT_BOILER = { liters: 80, coldWaterTemp: 10, showerTemp: 40, showerFlow: 8, warmFrom: 50 };

function onHomeyReady(Homey) {
  const form = document.getElementById('settings-form');
  // Texts in the language of Homey, from /locales
  const __ = (key, tokens) => Homey.__(`settings.${key}`, tokens);
  const blockTitle = block => Homey.__(`blocks.${block.id}`) || block.title;
  form.editPin.placeholder = __('none');
  form.accessCode.placeholder = __('none');

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
      const autoLabel = id => `${__('automatic')}${name(id) ? ` (${name(id)})` : ''}`;

      fillSelect(form.p1, list.devices, devices.p1, autoLabel(list.found.p1));
      fillSelect(form.boiler, list.devices, devices.boiler, autoLabel(list.found.boiler));
      fillSelect(form.thermostat, list.devices, devices.thermostat, autoLabel(list.found.thermostat));
      fillSelect(form.water, list.devices, devices.water, autoLabel(list.found.water));
      form.fuseAmps.value = config.grid?.fuseAmps ?? 25;
      form.editPin.value = config.editPin || '';
      form.accessCode.value = config.accessCode || '';
      form.pricesOn.checked = config.prices?.source !== 'off';
      fillContract(list.contract, list.suppliers);
      fillForecast(config.forecast || {});
      fillChecks('heating-list', 'heating', list.devices, devices.heating || [],
        d => d.class === 'heatpump' || d.class === 'boiler' || /warmtepomp|heat ?pump|cv|ketel/i.test(d.name),
        __('noHeating'));
      fillChecks('ev-list', 'evChargers', list.devices, devices.evChargers || [],
        d => d.class === 'evcharger' || /laadpa|charger|wallbox|easee|zaptec|alfen/i.test(d.name),
        __('noEv'));
      initLayout(list);

      fillChecks('solar-list', 'solar', list.devices, devices.solar || [],
        d => d.class === 'solarpanel' || /solar|zon|omvormer|inverter|pv/i.test(d.name),
        __('noSolar'));
      fillChecks('battery-list', 'batteries', list.devices, devices.batteries || [],
        d => d.class === 'battery' || /batter|zendure|solarflow|accu/i.test(d.name),
        __('noBattery'));
      form.invertPower.checked = Boolean(config.battery?.invertPower);

      const boiler = { ...DEFAULT_BOILER, ...config.boiler };
      BOILER_FIELDS.forEach(key => { form[key].value = boiler[key]; });
    } catch (err) {
      status.textContent = __('loadFailed', { error: err.message || err });
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const number = key => (form[key].value === '' ? undefined : Number(form[key].value));
      const config = {
        port: number('port') ?? 8080,
        editPin: form.editPin.value.trim(),
        accessCode: form.accessCode.value.trim(),
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
        prices: { source: form.pricesOn.checked ? 'energyzero' : 'off' },
        contract: contractToSave(number),
        forecast: forecastToSave(number),
        layout: layoutToSave(),
        battery: { invertPower: form.invertPower.checked },
        boiler: Object.fromEntries(BOILER_FIELDS.map(key => [key, number(key) ?? DEFAULT_BOILER[key]])),
      };
      if (config.boiler.showerTemp <= config.boiler.coldWaterTemp) {
        status.textContent = __('showerTooCold');
        return;
      }
      if (config.port < 1024 || config.port > 65535) {
        status.textContent = __('portRange');
        return;
      }
      if (config.accessCode && config.accessCode.length < 4) {
        status.textContent = __('accessCodeLength');
        return;
      }
      try {
        await setSetting('config', config);
        status.textContent = __('saved');
        // The app restarts the web server on a new port, give it a moment
        setTimeout(() => call('GET', '/settings-info').then(showDashboard).catch(() => {}), 1500);
      } catch (err) {
        status.textContent = __('saveFailed', { error: err.message || err });
      }
    });
  }

  // ---------- Solar forecast ----------

  function fillForecast(forecast) {
    form.forecastOn.checked = Boolean(forecast.enabled);
    [1, 2].forEach(n => {
      const p = (forecast.planes || [])[n - 1] || {};
      form[`kwp${n}`].value = p.kwp ?? '';
      form[`tilt${n}`].value = p.tilt ?? 35;
      form[`azimuth${n}`].value = String(p.azimuth ?? (n === 1 ? 0 : 90));
    });
    const show = () => { document.querySelector('[data-forecast]').hidden = !form.forecastOn.checked; };
    form.forecastOn.onchange = show;
    show();
  }

  // Planes without a size are left out
  function forecastToSave(number) {
    const planes = [1, 2]
      .map(n => ({ kwp: number(`kwp${n}`), tilt: number(`tilt${n}`) ?? 35, azimuth: Number(form[`azimuth${n}`].value) }))
      .filter(p => p.kwp > 0);
    return { enabled: form.forecastOn.checked && planes.length > 0, planes };
  }

  // ---------- Contract ----------

  // Shows the fields of the chosen contract type
  function showContractFields() {
    document.querySelectorAll('[data-contract]').forEach(el => {
      const [kind, type] = el.dataset.contract.split('-');
      el.hidden = form[kind === 'elec' ? 'elecType' : 'gasType'].value !== type;
    });
  }

  function fillContract(contract, suppliers) {
    const e = contract.electricity;
    const g = contract.gas;
    const value = v => (v === null || v === undefined ? '' : v);
    form.elecType.value = e.type;
    form.elecNormal.value = value(e.normal);
    form.elecLow.value = value(e.low);
    form.elecExport.value = value(e.export);
    form.lowFrom.value = e.lowFrom;
    form.lowTo.value = e.lowTo;
    form.lowWeekend.checked = e.lowWeekend;
    form.supplier.innerHTML = suppliers
      .map(s => `<option value="${s.id}">${escapeText(s.id === 'other' ? __('otherSupplier') : s.name)}</option>`)
      .join('');
    form.supplier.value = e.supplier;
    form.elecMarkup.value = e.markup;
    form.elecTax.value = e.energyTax;
    form.netting.checked = e.netting;
    form.exportFee.value = e.exportFee;
    form.gasType.value = g.type;
    form.gasPrice.value = value(g.price);
    form.gasMarkup.value = g.markup;
    form.gasTax.value = g.energyTax;
    form.monthly.value = value(contract.monthly);
    form.taxReduction.value = value(contract.taxReduction);
    form.waterPrice.value = value(contract.water);
    // Choosing a supplier fills in its usual markup, which can still be changed
    form.supplier.onchange = () => {
      const supplier = suppliers.find(s => s.id === form.supplier.value);
      if (supplier && supplier.id !== 'other') form.elecMarkup.value = supplier.markup;
    };
    form.elecType.onchange = showContractFields;
    form.gasType.onchange = showContractFields;
    showContractFields();
  }

  function contractToSave(number) {
    const empty = key => (number(key) === undefined ? null : number(key));
    return {
      electricity: {
        type: form.elecType.value,
        normal: empty('elecNormal'),
        low: empty('elecLow'),
        export: empty('elecExport'),
        lowFrom: number('lowFrom') ?? 23,
        lowTo: number('lowTo') ?? 7,
        lowWeekend: form.lowWeekend.checked,
        supplier: form.supplier.value,
        markup: number('elecMarkup') ?? 0,
        energyTax: empty('elecTax'),
        netting: form.netting.checked,
        exportFee: number('exportFee') ?? 0,
      },
      gas: {
        type: form.gasType.value,
        price: empty('gasPrice'),
        markup: number('gasMarkup') ?? 0,
        energyTax: empty('gasTax'),
      },
      water: empty('waterPrice'),
      monthly: empty('monthly'),
      taxReduction: empty('taxReduction'),
    };
  }

  function showDashboard(info) {
    const link = document.getElementById('dashboard-url');
    link.textContent = info.dashboardUrl;
    link.href = info.dashboardUrl;
    const status = document.getElementById('server-status');
    const reason = info.server.reason === 'portInUse' ? __('portInUse', { port: info.server.port }) : info.server.message || '';
    status.textContent = info.server.running ? __('serverRunning') : `${__('serverStopped')} ${reason}`;
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
    return [...shown, ...hidden].map(b => ({ ...b, title: blockTitle(blocks.find(x => x.id === b.id)) }));
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

  const SIZE_LABELS = { small: __('sizeSmall'), half: __('sizeHalf'), large: __('sizeLarge'), full: __('sizeFull') };

  function renderLayout() {
    const list = document.getElementById('layout-list');
    list.innerHTML = layoutItems.map((b, i) => `
      <li class="${b.on ? '' : 'off'}" data-i="${i}">
        <input type="checkbox" data-action="toggle" ${b.on ? 'checked' : ''} aria-label="${escapeText(__('show', { name: b.title }))}">
        <span class="name">${escapeText(b.title)}</span>
        <select data-action="size" aria-label="${escapeText(__('width'))}">
          ${Object.entries(SIZE_LABELS).map(([id, label]) => `<option value="${id}" ${b.size === id ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        ${b.rows ? `<button type="button" class="chip" data-action="auto-height" title="${escapeText(__('ownHeightHelp'))}">${escapeText(__('ownHeight'))}</button>` : ''}
        <button type="button" class="move" data-action="up" ${i === 0 ? 'disabled' : ''} aria-label="${escapeText(__('moveUp'))}">↑</button>
        <button type="button" class="move" data-action="down" ${i === layoutItems.length - 1 ? 'disabled' : ''} aria-label="${escapeText(__('moveDown'))}">↓</button>
      </li>`).join('');
    document.getElementById('layout-mode').textContent = layoutCustom
      ? __('layoutCustom')
      : __('layoutDefault');
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
