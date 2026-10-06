"use strict";
(function() {
  const TOKEN_KEY = "energy-dashboard-settings-token";
  let token = null;
  try {
    token = sessionStorage.getItem(TOKEN_KEY);
  } catch {
  }
  let texts = {};
  let started = false;
  const __ = (key, tokens = {}) => {
    const text = key.split(".").reduce((o, k) => o ? o[k] : void 0, texts);
    return typeof text === "string" ? text.replace(/__(\w+)__/g, (m, k) => k in tokens ? tokens[k] : m) : "";
  };
  async function request(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json", "X-Settings-Token": token || "" },
      body: body === void 0 ? void 0 : JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      askPin();
      throw new Error(data.error || "Pincode nodig");
    }
    if (!res.ok) throw new Error(data.error || String(res.status));
    return data;
  }
  const Homey = {
    web: true,
    __,
    api: (method, path, body, cb) => request("POST", "/api/settings/call", { method, path, body }).then((d) => cb(null, d), cb),
    get: (key, cb) => request("GET", "/api/settings/value?key=".concat(encodeURIComponent(key))).then((d) => cb(null, d.value), cb),
    set: (key, value, cb) => request("POST", "/api/settings/value", { key, value }).then(() => cb(null), cb),
    ready: () => {
    },
    openURL: (url) => window.open(url, "_blank", "noopener")
  };
  function start() {
    if (started) return;
    started = true;
    const box = document.getElementById("settings-pin");
    if (box) box.hidden = true;
    window.onHomeyReady(Homey);
  }
  function askPin(message) {
    let box = document.getElementById("settings-pin");
    if (!box) {
      box = document.createElement("form");
      box.id = "settings-pin";
      box.className = "card";
      box.innerHTML = '\n        <h2></h2>\n        <p class="muted"></p>\n        <label><span></span> <input name="pin" type="password" inputmode="numeric" autocomplete="current-password" required></label>\n        <div class="form-actions"><button type="submit"></button></div>\n        <p class="muted" data-error></p>';
      box.querySelector("h2").textContent = __("settings.webTitle");
      box.querySelector("p").textContent = __("settings.webPinHelp");
      box.querySelector("label span").textContent = __("settings.editPin");
      box.querySelector("button").textContent = __("settings.webUnlock");
      box.addEventListener("submit", async (event) => {
        event.preventDefault();
        const error = box.querySelector("[data-error]");
        error.textContent = "…";
        try {
          const result = await request("POST", "/api/settings/unlock", { pin: box.pin.value });
          token = result.token;
          try {
            sessionStorage.setItem(TOKEN_KEY, token);
          } catch {
          }
          box.pin.value = "";
          error.textContent = "";
          if (started) box.hidden = true;
          else start();
        } catch (err) {
          error.textContent = err.message;
        }
      });
      document.body.prepend(box);
    }
    box.hidden = false;
    if (message) box.querySelector("[data-error]").textContent = message;
    box.pin.focus();
  }
  window.addEventListener("load", async () => {
    try {
      const result = await fetch("/api/settings/texts").then((r) => r.json());
      texts = result.texts || {};
      document.documentElement.lang = result.lang || "nl";
    } catch {
    }
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = __(el.dataset.i18n);
    });
    document.title = __("settings.webTitle");
    document.body.classList.add("web");
    const back = document.createElement("p");
    back.className = "web-back";
    back.innerHTML = '<a class="url" href="/">← Dashboard</a>';
    document.body.prepend(back);
    const main = [...document.body.children].filter((el) => el.tagName !== "SCRIPT" && el !== back);
    main.forEach((el) => {
      el.dataset.locked = el.hidden ? "hidden" : "";
      el.hidden = true;
    });
    const reveal = () => main.forEach((el) => {
      el.hidden = el.dataset.locked === "hidden";
    });
    const realStart = start;
    start = () => {
      reveal();
      realStart();
    };
    if (token) {
      try {
        await request("GET", "/api/settings/check");
        start();
        return;
      } catch {
      }
    }
    askPin();
  });
})();
