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

  // Every change is saved by itself: the check mark at the top of Homey only closes the page,
  // so a choice made without pressing Save was lost
  let loaded = false;
  let saveTimer = null;
  const autosave = () => {
    if (!loaded) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => form.requestSubmit(), 400);
  };
  form.addEventListener('change', autosave);
  window.addEventListener('pagehide', () => { if (saveTimer) form.requestSubmit(); });

  loadSettings().finally(() => { loaded = true; Homey.ready(); });

  async function loadSettings() {
    const status = document.getElementById('save-status');
    try {
      const [config = {}, list] = await Promise.all([getSetting('config').then(c => c || {}), call('GET', '/settings-info')]);
      showDashboard(list);
      form.port.value = config.port || 8686;
      const devices = config.devices || {};
      const name = id => list.devices.find(d => d.id === id)?.name;
      const autoLabel = id => `${__('automatic')}${name(id) ? ` (${name(id)})` : ''}`;

      fillSelect(form.p1, list.devices, devices.p1, autoLabel(list.found.p1));
      fillSelect(form.boiler, list.devices, devices.boiler, autoLabel(list.found.boiler));
      fillSelect(form.thermostat, list.devices, devices.thermostat, autoLabel(list.found.thermostat));
      fillSelect(form.water, list.devices, devices.water, autoLabel(list.found.water));
      form.fuseAmps.value = config.grid?.fuseAmps ?? 25;
      form.capacityTariff.value = config.grid?.capacityTariff ?? '';
      form.capacityMin.value = config.grid?.capacityMin ?? 2.5;
      form.editPin.value = config.editPin || '';
      form.accessCode.value = config.accessCode || '';
      fillPriceSource(config.prices || {}, list.prices);
      fillContract(list.contract, list.suppliers);
      fillForecast(config.forecast || {});
      form.alertHours.value = config.alerts?.hours ?? 4;
      form.alertNotify.checked = Boolean(config.alerts?.notify);
      fillChecks('heating-list', 'heating', list.devices, devices.heating || [],
        d => d.class === 'heatpump' || d.class === 'boiler' || /warmtepomp|heat ?pump|cv|ketel/i.test(d.name),
        __('noHeating'));
      fillChecks('ev-list', 'evChargers', list.devices, devices.evChargers || [],
        d => d.class === 'evcharger' || /laadpa|charger|wallbox|easee|zaptec|alfen/i.test(d.name),
        __('noEv'));
      initLayout(list);
      fillGroups(config.groups || [], list.devices);

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
      clearTimeout(saveTimer);
      saveTimer = null;
      const number = key => (form[key].value === '' ? undefined : Number(form[key].value));
      const config = {
        port: number('port') ?? 8686,
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
        grid: { fuseAmps: number('fuseAmps') ?? 25, capacityTariff: number('capacityTariff') ?? null, capacityMin: number('capacityMin') ?? 2.5 },
        prices: { source: form.priceSource.value, chosen: true },
        contract: contractToSave(number),
        forecast: forecastToSave(),
        alerts: { hours: number('alertHours') ?? 4, notify: form.alertNotify.checked },
        layout: layoutToSave(),
        groups: groupsToSave(),
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
        // Keeps what this page does not edit, such as the named layouts saved on the dashboard
        const saved = await getSetting('config').then(c => c || {});
        await setSetting('config', { ...saved, ...config });
        status.textContent = __('saved');
        // The app restarts the web server on a new port, give it a moment
        setTimeout(() => call('GET', '/settings-info').then(showDashboard).catch(() => {}), 1500);
      } catch (err) {
        status.textContent = __('saveFailed', { error: err.message || err });
      }
    });
  }

  // ---------- Prices ----------

  // Before this list existed, "energyzero" was saved for every price block that was on; only a
  // source chosen here counts as a choice. The note says what is in use and what Homey has.
  function fillPriceSource(prices, info) {
    form.priceSource.value = prices.source === 'energyzero' && !prices.chosen ? 'auto' : prices.source || 'auto';
    const note = document.getElementById('price-source-note');
    const homey = info?.homey;
    const parts = [info?.source === 'homey' ? __('sourceInUseHomey') : info?.source === 'powerhour' ? __('sourceInUsePowerhour')
      : info?.source === 'off' ? __('sourceInUseOff') : __('sourceInUseEnergyZero')];
    if (prices.source === 'powerhour' && info?.source !== 'powerhour') parts.unshift(__('powerhourMissing'));
    if (homey?.type === 'dynamic') {
      parts.push(homey.usable ? __('homeyFormula', { formula: homey.formula }) : __('homeyNoFormula'));
    } else if (homey?.type === 'fixed' && homey.fixed) {
      parts.push(__('homeyFixed', { price: homey.fixed }));
    } else if (homey) {
      parts.push(__('homeyNoPrices'));
    }
    note.textContent = parts.join(' ');
  }

  // ---------- Solar forecast ----------

  // Roof planes: two to start with, up to 10 (Forecast.Solar asks one plane per request)
  const MAX_PLANES = 10;
  const DIRECTIONS = [['-90', 'east'], ['-45', 'southEast'], ['0', 'south'], ['45', 'southWest'], ['90', 'west'], ['180', 'north']];
  let planes = [];

  function renderPlanes() {
    const box = document.getElementById('planes');
    box.innerHTML = planes.map((p, i) => `
      <div class="plane" data-plane="${i}">
        <p class="muted">${escapeText(__(i === 0 ? 'planeFirst' : 'planeOptional', { n: i + 1 }))}
          ${i >= 2 ? `<button type="button" class="link" data-remove="${i}">${escapeText(__('removePlane'))}</button>` : ''}</p>
        <label><span>${escapeText(__('kwp'))}</span> <input data-field="kwp" type="number" min="0" max="100" step="0.01" value="${p.kwp ?? ''}"></label>
        <label><span>${escapeText(__('tilt'))}</span> <input data-field="tilt" type="number" min="0" max="90" step="1" value="${p.tilt ?? 35}"></label>
        <label><span>${escapeText(__('azimuth'))}</span>
          <select data-field="azimuth">${DIRECTIONS.map(([value, key]) => `<option value="${value}" ${String(p.azimuth) === value ? 'selected' : ''}>${escapeText(__(key))}</option>`).join('')}</select>
        </label>
      </div>`).join('');
    document.getElementById('plane-add').hidden = planes.length >= MAX_PLANES;
  }

  // Keeps what was typed, so adding or removing a plane does not lose it
  function readPlanes() {
    document.querySelectorAll('#planes .plane').forEach(el => {
      const p = planes[Number(el.dataset.plane)];
      el.querySelectorAll('[data-field]').forEach(input => {
        p[input.dataset.field] = input.value === '' ? undefined : Number(input.value);
      });
    });
  }

  function fillForecast(forecast) {
    form.forecastOn.checked = Boolean(forecast.enabled);
    planes = (forecast.planes || []).map(p => ({ kwp: p.kwp, tilt: p.tilt ?? 35, azimuth: p.azimuth ?? 0 }));
    while (planes.length < 2) planes.push({ tilt: 35, azimuth: planes.length === 0 ? 0 : 90 });
    renderPlanes();
    document.getElementById('plane-add').onclick = () => {
      readPlanes();
      if (planes.length < MAX_PLANES) planes.push({ tilt: 35, azimuth: 0 });
      renderPlanes();
    };
    document.getElementById('planes').onclick = event => {
      const remove = event.target.closest('[data-remove]');
      if (!remove) return;
      readPlanes();
      planes.splice(Number(remove.dataset.remove), 1);
      renderPlanes();
    };
    const show = () => { document.querySelector('[data-forecast]').hidden = !form.forecastOn.checked; };
    form.forecastOn.onchange = show;
    show();
  }

  // Planes without a size are left out
  function forecastToSave() {
    readPlanes();
    const kept = planes
      .map(p => ({ kwp: p.kwp, tilt: p.tilt ?? 35, azimuth: p.azimuth ?? 0 }))
      .filter(p => p.kwp > 0);
    return { enabled: form.forecastOn.checked && kept.length > 0, planes: kept };
  }

  // ---------- Groups ----------

  // Groups in the fuse box with their fuse, and per device with a power meter the group it is
  // on. A device is on one group at most; groups without a name are not saved.
  const MAX_GROUPS = 40;
  let groups = [];
  let groupDevices = [];
  let newGroup = 0;

  function renderGroups() {
    document.getElementById('groups').innerHTML = groups.map((g, i) => `
      <div class="plane" data-group="${i}">
        <label><span>${escapeText(__('groupName'))}</span> <input data-field="name" type="text" maxlength="40" value="${escapeText(g.name || '')}" placeholder="${escapeText(__('groupPlaceholder', { n: i + 1 }))}"></label>
        <label><span>${escapeText(__('groupFuse'))}</span> <input data-field="fuseAmps" type="number" min="1" max="80" step="1" value="${g.fuseAmps ?? 16}"></label>
        <label><span>${escapeText(__('groupPhases'))}</span>
          <select data-field="phases"><option value="1" ${g.phases === 3 ? '' : 'selected'}>1</option><option value="3" ${g.phases === 3 ? 'selected' : ''}>3</option></select>
        </label>
        <p><span></span><button type="button" class="link" data-remove-group="${i}">${escapeText(__('removeGroup'))}</button></p>
      </div>`).join('');
    document.getElementById('group-add').hidden = groups.length >= MAX_GROUPS;
    renderGroupDevices();
  }

  // One list of devices with a choice of group each: easier than a list of devices per group
  function renderGroupDevices() {
    const box = document.getElementById('group-devices');
    const named = groups.filter(g => g.name);
    if (!named.length) { box.innerHTML = ''; return; }
    const options = selected => `<option value="">–</option>${named.map(g => `<option value="${escapeText(g.id)}" ${g.id === selected ? 'selected' : ''}>${escapeText(g.name)}</option>`).join('')}`;
    box.innerHTML = `<p class="muted">${escapeText(__('groupDevicesHelp'))}</p>`
      + groupDevices.map(d => {
        const on = groups.find(g => g.devices.includes(d.id));
        return `<label><span>${escapeText(d.name)}</span> <select data-group-device="${d.id}">${options(on?.id)}</select></label>`;
      }).join('');
  }

  function readGroups() {
    document.querySelectorAll('#groups [data-group]').forEach(el => {
      const g = groups[Number(el.dataset.group)];
      el.querySelectorAll('[data-field]').forEach(input => {
        g[input.dataset.field] = input.dataset.field === 'name' ? input.value.trim() : Number(input.value) || undefined;
      });
    });
    document.querySelectorAll('#group-devices [data-group-device]').forEach(select => {
      const id = select.dataset.groupDevice;
      groups.forEach(g => { g.devices = g.devices.filter(x => x !== id); });
      const g = groups.find(x => x.id === select.value);
      if (g) g.devices.push(id);
    });
  }

  function fillGroups(saved, devices) {
    groupDevices = devices.filter(d => d.power);
    groups = saved.map(g => ({ id: String(g.id || g.name), name: g.name || '', fuseAmps: g.fuseAmps ?? 16, phases: g.phases === 3 ? 3 : 1, devices: [...(g.devices || [])] }));
    renderGroups();
    document.getElementById('group-add').onclick = () => {
      readGroups();
      if (groups.length < MAX_GROUPS) groups.push({ id: `g${Date.now().toString(36)}${newGroup++}`, name: '', fuseAmps: 16, phases: 1, devices: [] });
      renderGroups();
      document.querySelector(`#groups [data-group="${groups.length - 1}"] input`)?.focus();
    };
    document.getElementById('groups').onclick = event => {
      const remove = event.target.closest('[data-remove-group]');
      if (!remove) return;
      readGroups();
      groups.splice(Number(remove.dataset.removeGroup), 1);
      renderGroups();
      autosave();
    };
    // A new or renamed group shows up in the device choices
    document.getElementById('groups').addEventListener('change', () => { readGroups(); renderGroupDevices(); });
  }

  function groupsToSave() {
    readGroups();
    return groups
      .filter(g => g.name)
      .map(g => ({ id: g.id, name: g.name, fuseAmps: g.fuseAmps || 16, phases: g.phases === 3 ? 3 : 1, devices: g.devices }));
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
    form.exportAfter.value = value(e.exportAfter);
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
    // Choosing a supplier fills in its usual markup, which can still be changed; the note says
    // whether the supplier publishes these amounts itself
    const showSupplierNote = supplier => {
      const note = document.getElementById('supplier-note');
      if (!supplier || supplier.id === 'other') {
        note.textContent = __('supplierOther');
        return;
      }
      const confirmed = supplier.confirmed || {};
      const gasKnown = typeof supplier.gasMarkup === 'number';
      const key = confirmed.markup && (confirmed.gasMarkup || !gasKnown)
        ? 'supplierConfirmed'
        : confirmed.markup ? 'supplierPartly' : 'supplierUnconfirmed';
      note.textContent = `${__(key, { name: supplier.name })}${gasKnown ? '' : ` ${__('supplierNoGas')}`}`;
    };
    form.supplier.onchange = () => {
      const supplier = suppliers.find(s => s.id === form.supplier.value);
      showSupplierNote(supplier);
      if (!supplier || supplier.id === 'other') return;
      form.elecMarkup.value = supplier.markup;
      // An unknown gas markup is left empty rather than keeping another supplier's amount
      form.gasMarkup.value = typeof supplier.gasMarkup === 'number' ? supplier.gasMarkup : '';
    };
    showSupplierNote(suppliers.find(s => s.id === e.supplier));
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
        exportAfter: empty('exportAfter'),
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
      autosave();
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
    if (event.type === 'click') autosave();
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

  // ---------- Share diagnosis ----------

  // Sharing makes the report, shows it below the buttons, copies it and opens an e-mail to the
  // developer (the default, no account needed) or a GitHub issue, with the report filled in when
  // it fits in the address; otherwise the user pastes it from the clipboard. Nothing is sent
  // until the user sends the e-mail or submits the issue, where they see the report too.
  const ISSUES = 'https://github.com/WNijhof/homey-energy-dashboard/issues/new';
  // Mail programs cut off long mailto addresses, GitHub allows more
  const MAIL_LIMIT = 1800;
  const GITHUB_LIMIT = 7000;
  const shareStatus = document.getElementById('share-status');
  const reportBox = document.getElementById('share-report');
  let shared = null;

  // A fresh report for each share; false when it could not be made
  async function makeReport() {
    shareStatus.textContent = '…';
    try {
      const snapshot = document.getElementById('share-snapshot').checked;
      shared = await call('GET', `/diagnosis-report${snapshot ? '?snapshot=1' : ''}`);
      reportBox.value = JSON.stringify(shared.report, null, 2);
      reportBox.hidden = false;
      shareStatus.textContent = '';
      return true;
    } catch (err) {
      shareStatus.textContent = __('shareFailed', { error: err.message || err });
      return false;
    }
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportBox.value);
    } catch {
      reportBox.select();
      try { document.execCommand('copy'); } catch { /* the user can still select it */ }
    }
  }

  // The apps of the devices, e.g. com.tweakers.zendure, as the subject or title
  function subject() {
    const r = shared.report;
    const apps = [...new Set([...(r.found?.batteries || []), ...(r.found?.solar || []), ...(r.batteryLike || []), r.found?.p1]
      .map(d => /^homey:app:([^:]+)/.exec(d?.app || '')?.[1]).filter(Boolean))];
    return __('shareIssueTitle', { apps: apps.join(', ') || r.version });
  }

  function open(url) {
    shareStatus.textContent = __('shareCopied');
    if (Homey.openURL) Homey.openURL(url);
    else window.open(url, '_blank');
  }

  document.getElementById('share-mail').onclick = async () => {
    if (!await makeReport()) return;
    await copyReport();
    // Without a contact address in the manifest, GitHub is the way
    if (!shared.email) {
      document.getElementById('share-github').onclick(false);
      return;
    }
    // Without spaces the report takes less room, so more often fits in the mail itself
    const compact = JSON.stringify(shared.report);
    const full = `${__('shareIssueIntro')}\n\n\n${compact}\n`;
    const body = encodeURIComponent(full).length < MAIL_LIMIT ? full : `${__('shareIssueIntro')}\n\n\n${__('sharePaste')}\n`;
    open(`mailto:${shared.email}?subject=${encodeURIComponent(subject())}&body=${encodeURIComponent(body)}`);
  };

  // A click makes a new report; from the e-mail button (fresh = false) it is already made
  document.getElementById('share-github').onclick = async fresh => {
    if (fresh !== false && !await makeReport()) return;
    await copyReport();
    const full = `${__('shareIssueIntro')}\n\n\n\`\`\`json\n${reportBox.value}\n\`\`\`\n`;
    const body = encodeURIComponent(full).length < GITHUB_LIMIT ? full : `${__('shareIssueIntro')}\n\n\n${__('sharePaste')}\n`;
    open(`${ISSUES}?title=${encodeURIComponent(subject())}&body=${encodeURIComponent(body)}`);
  };

  function escapeText(text) {
    const span = document.createElement('span');
    span.textContent = text;
    return span.innerHTML;
  }
}
