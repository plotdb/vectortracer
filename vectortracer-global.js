/**
 * VectorTracer — global script wrapper
 *
 * Load as a plain <script> (no type="module" needed):
 *   <script src="vectortracer-global.js"></script>
 *
 * Then use:
 *   const svg = await window.vectortracer.trace(blob, config);
 *
 * The WASM module is initialised lazily on the first call to trace().
 * See api.js for full config documentation.
 */
(function () {
  // Capture script directory NOW, while document.currentScript is still valid.
  // Dynamic import() in a non-module script resolves relative to the document,
  // not the script file, so we must build an absolute URL here.
  const scriptDir = new URL('.', document.currentScript.src).href;

  let _modulePromise = null;

  function _loadModule() {
    if (!_modulePromise) {
      _modulePromise = import(scriptDir + 'api.js');
    }
    return _modulePromise;
  }

  window.vectortracer = {
    /**
     * Convert an image Blob to an SVG string.
     * @param {Blob} blob
     * @param {object} [config]  — same options as api.js trace()
     * @returns {Promise<string>}
     */
    trace: function (blob, config) {
      return _loadModule().then(function (m) {
        return m.trace(blob, config);
      });
    },
  };
})();
