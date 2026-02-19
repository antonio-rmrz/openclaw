/**
 * OpenClaw Stealth — anti-fingerprinting patches
 * Runs in the page's MAIN world at document_start, before any site JS executes.
 * Based on techniques from puppeteer-extra-plugin-stealth.
 */
(function () {
  "use strict";

  // ── 1. navigator.webdriver ──────────────────────────────────────────────────
  // The most checked automation flag.
  Object.defineProperty(navigator, "webdriver", {
    get: () => undefined,
    configurable: true,
  });

  // ── 2. navigator.plugins ────────────────────────────────────────────────────
  // Real Chrome has 3 built-in plugins; automation has 0.
  Object.defineProperty(navigator, "plugins", {
    get: () => {
      const arr = [
        {
          name: "Chrome PDF Plugin",
          filename: "internal-pdf-viewer",
          description: "Portable Document Format",
          length: 1,
        },
        {
          name: "Chrome PDF Viewer",
          filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
          description: "",
          length: 1,
        },
        { name: "Native Client", filename: "internal-nacl-plugin", description: "", length: 2 },
      ];
      Object.setPrototypeOf(arr, PluginArray.prototype);
      return arr;
    },
  });

  Object.defineProperty(navigator, "mimeTypes", {
    get: () => {
      const arr = [
        { type: "application/pdf", suffixes: "pdf", description: "", enabledPlugin: {} },
        {
          type: "application/x-google-chrome-pdf",
          suffixes: "pdf",
          description: "Portable Document Format",
          enabledPlugin: {},
        },
        {
          type: "application/x-nacl",
          suffixes: "",
          description: "Native Client Executable",
          enabledPlugin: {},
        },
        {
          type: "application/x-pnacl",
          suffixes: "",
          description: "Portable Native Client Executable",
          enabledPlugin: {},
        },
      ];
      Object.setPrototypeOf(arr, MimeTypeArray.prototype);
      return arr;
    },
  });

  // ── 3. navigator.languages ──────────────────────────────────────────────────
  Object.defineProperty(navigator, "languages", {
    get: () => ["en-US", "en"],
  });

  // ── 4. navigator.vendor ─────────────────────────────────────────────────────
  Object.defineProperty(navigator, "vendor", {
    get: () => "Google Inc.",
  });

  // ── 5. window.chrome ────────────────────────────────────────────────────────
  // Many sites check for the full chrome object structure.
  if (!window.chrome) {
    window.chrome = {};
  }

  if (!window.chrome.app) {
    window.chrome.app = {
      isInstalled: false,
      InstallState: {
        DISABLED: "disabled",
        INSTALLED: "installed",
        NOT_INSTALLED: "not_installed",
      },
      RunningState: { CANNOT_RUN: "cannot_run", READY_TO_RUN: "ready_to_run", RUNNING: "running" },
      getDetails: () => null,
      getIsInstalled: () => false,
      runningState: () => "cannot_run",
    };
  }

  if (!window.chrome.csi) {
    window.chrome.csi = () => ({
      startE: Date.now(),
      onloadT: Date.now(),
      pageT: performance.now(),
      tran: 15,
    });
  }

  if (!window.chrome.loadTimes) {
    window.chrome.loadTimes = () => ({
      commitLoadTime: Date.now() / 1000,
      connectionInfo: "h2",
      finishDocumentLoadTime: 0,
      finishLoadTime: 0,
      firstPaintAfterLoadTime: 0,
      firstPaintTime: 0,
      navigationType: "Other",
      npnNegotiatedProtocol: "h2",
      requestTime: Date.now() / 1000,
      startLoadTime: Date.now() / 1000,
      wasAlternateProtocolAvailable: false,
      wasFetchedViaSpdy: true,
      wasNpnNegotiated: true,
    });
  }

  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      PlatformOs: {
        MAC: "mac",
        WIN: "win",
        ANDROID: "android",
        CROS: "cros",
        LINUX: "linux",
        OPENBSD: "openbsd",
      },
      PlatformArch: { ARM: "arm", X86_32: "x86-32", X86_64: "x86-64" },
      PlatformNaclArch: { ARM: "arm", X86_32: "x86-32", X86_64: "x86-64" },
      RequestUpdateCheckStatus: {
        THROTTLED: "throttled",
        NO_UPDATE: "no_update",
        UPDATE_AVAILABLE: "update_available",
      },
      OnInstalledReason: {
        INSTALL: "install",
        UPDATE: "update",
        CHROME_UPDATE: "chrome_update",
        SHARED_MODULE_UPDATE: "shared_module_update",
      },
      OnRestartRequiredReason: {
        APP_UPDATE: "app_update",
        OS_UPDATE: "os_update",
        PERIODIC: "periodic",
      },
      connect: () => {},
      sendMessage: () => {},
    };
  }

  // ── 6. Permissions API ──────────────────────────────────────────────────────
  if (navigator.permissions && navigator.permissions.query) {
    const _query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (params) => {
      if (params.name === "notifications") {
        return Promise.resolve({ state: Notification.permission, onchange: null });
      }
      return _query(params);
    };
  }

  // ── 7. WebGL vendor/renderer ─────────────────────────────────────────────────
  // Headless/virtualised GL reports different strings; patch to look like real Intel hardware.
  const patchWebGL = (ctx) => {
    const _get = ctx.prototype.getParameter;
    ctx.prototype.getParameter = function (parameter) {
      if (parameter === 37445) {
        return "Intel Inc.";
      } // UNMASKED_VENDOR_WEBGL
      if (parameter === 37446) {
        return "Intel Iris OpenGL Engine";
      } // UNMASKED_RENDERER_WEBGL
      return _get.call(this, parameter);
    };
  };
  if (typeof WebGLRenderingContext !== "undefined") {
    patchWebGL(WebGLRenderingContext);
  }
  if (typeof WebGL2RenderingContext !== "undefined") {
    patchWebGL(WebGL2RenderingContext);
  }

  // ── 8. Iframe contentWindow webdriver ───────────────────────────────────────
  try {
    const _cwDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      get() {
        const win = _cwDesc.get.call(this);
        if (win && win.navigator && win.navigator.webdriver) {
          Object.defineProperty(win.navigator, "webdriver", {
            get: () => undefined,
            configurable: true,
          });
        }
        return win;
      },
    });
  } catch {}

  // ── 9. navigator.connection ─────────────────────────────────────────────────
  if (!navigator.connection) {
    Object.defineProperty(navigator, "connection", {
      get: () => ({
        rtt: 100,
        type: "wifi",
        saveData: false,
        effectiveType: "4g",
        downlink: 5,
        onchange: null,
      }),
    });
  }

  // ── 10. Battery API ─────────────────────────────────────────────────────────
  if (navigator.getBattery) {
    const _getBattery = navigator.getBattery.bind(navigator);
    navigator.getBattery = () =>
      _getBattery().catch(() =>
        Promise.resolve({
          charging: true,
          chargingTime: 0,
          dischargingTime: Infinity,
          level: 1.0,
          onchargingchange: null,
          onchargingtimechange: null,
          ondischargingtimechange: null,
          onlevelchange: null,
        }),
      );
  }

  // ── 11. CDP artifact cleanup ─────────────────────────────────────────────────
  // Some older CDP/chromedriver versions leave these global symbols.
  try {
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
  } catch {}
  try {
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
  } catch {}
  try {
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
  } catch {}

  // ── 12. outerWidth / outerHeight ─────────────────────────────────────────────
  // Real browsers have these match the window frame; automation often leaves them at 0.
  if (window.outerWidth === 0) {
    Object.defineProperty(window, "outerWidth", { get: () => window.innerWidth });
    Object.defineProperty(window, "outerHeight", { get: () => window.innerHeight + 88 });
  }

  // ── 13. hairlineFeature (used by some Google checks) ────────────────────────
  // Automation detection via devicePixelRatio timing fingerprint.
  if (!window.devicePixelRatio || window.devicePixelRatio === 0) {
    Object.defineProperty(window, "devicePixelRatio", { get: () => 1 });
  }
})();
