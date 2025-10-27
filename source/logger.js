(function (global) {
  const LEVELS = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
  };

  const METHOD_MAP = {
    debug: typeof console.debug === "function" ? "debug" : "log",
    info: typeof console.info === "function" ? "info" : "log",
    warn: typeof console.warn === "function" ? "warn" : "log",
    error: typeof console.error === "function" ? "error" : "log",
  };

  const STORAGE_KEY = "debugLoggingEnabled";

  let debugEnabled = false;

  function storageAvailable() {
    return typeof chrome !== "undefined" && !!chrome.storage?.local;
  }

  function shouldLog(level) {
    if (debugEnabled) return true;
    return level !== "debug";
  }

  function log(level, context, args) {
    if (!shouldLog(level)) return;

    const prefix = `[${context}] [${level.toUpperCase()}]`;
    const methodName = METHOD_MAP[level] || "log";
    const method = console[methodName] || console.log;
    method.call(console, prefix, ...args);
  }

  function createLogger(context) {
    return {
      debug: (...args) => log("debug", context, args),
      info: (...args) => log("info", context, args),
      warn: (...args) => log("warn", context, args),
      error: (...args) => log("error", context, args),
    };
  }

  function setDebug(value, { persist = false } = {}) {
    debugEnabled = !!value;
    if (persist && storageAvailable()) {
      try {
        chrome.storage.local.set({ [STORAGE_KEY]: debugEnabled });
      } catch (err) {
        console.warn("[Logger] Failed to persist debug flag", err);
      }
    }
  }

  function initFromStorage() {
    if (!storageAvailable()) return;

    try {
      chrome.storage.local.get({ [STORAGE_KEY]: false }, (result) => {
        debugEnabled = Boolean(result[STORAGE_KEY]);
      });

      chrome.storage.onChanged?.addListener((changes, area) => {
        if (area === "local" && Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
          debugEnabled = Boolean(changes[STORAGE_KEY].newValue);
        }
      });
    } catch (err) {
      console.warn("[Logger] Failed to initialize from storage", err);
    }
  }

  initFromStorage();

  const Logger = {
    LEVELS,
    DEBUG_STORAGE_KEY: STORAGE_KEY,
    createLogger,
    setDebug,
    isDebugEnabled: () => debugEnabled,
  };

  global.Logger = Logger;
})(typeof self !== "undefined" ? self : globalThis);
