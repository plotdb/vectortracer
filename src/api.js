/**
 * VectorTracer API
 *
 * Usage:
 *   import { trace } from './api.js';
 *   const svg = await trace(blob, { colorMode: 'color', colorPrecision: 6 });
 *
 * Config defaults match vtracer CLI defaults.
 * cornerThreshold and spliceThreshold are in degrees (converted to radians internally).
 */

import init, { BinaryImageConverter, ColorImageConverter } from './vectortracer.js';

let _initPromise = null;
let _wasmInput = undefined; // overridable for bundled (inline) usage

/** For bundled builds: call this with a Uint8Array of the WASM bytes before trace(). */
export function _setWasmInput(input) { _wasmInput = input; }

/** Initialise the WASM module once; subsequent calls are no-ops. */
function ensureInit() {
  if (!_initPromise) _initPromise = init(_wasmInput);
  return _initPromise;
}

/**
 * Convert an image Blob to a vector SVG string.
 *
 * @param {Blob} blob - Any image format the browser can decode (PNG, JPEG, WebP, …)
 * @param {object} [config]
 * @param {'color'|'bw'}              [config.colorMode='color']
 * @param {'spline'|'polygon'|'none'} [config.mode='spline']
 * @param {number} [config.filterSpeckle=4]      - Minimum cluster side length (px). Smaller clusters are discarded.
 * @param {number} [config.cornerThreshold=60]   - Corner detection angle threshold (degrees).
 * @param {number} [config.lengthThreshold=4]    - Minimum path segment length.
 * @param {number} [config.maxIterations=10]     - Curve-fitting max iterations.
 * @param {number} [config.spliceThreshold=45]   - Splice angle threshold (degrees).
 * @param {number} [config.pathPrecision=8]      - SVG coordinate decimal places.
 * @param {number} [config.colorPrecision=6]     - Color clustering precision 1–8 (color mode only).
 * @param {number} [config.layerDifference=16]   - Layer separation strength (color mode only).
 * @param {boolean} [config.invert=false]        - Invert dark/light (bw mode only).
 * @param {string} [config.backgroundColor]      - SVG background color (CSS value). Defaults to 'white'.
 * @param {string} [config.pathFill]             - Override all path fill colors. Defaults to auto.
 * @param {number} [config.scale=1]              - Scale factor applied to the output SVG.
 * @returns {Promise<string>} SVG markup string
 */
export async function trace(blob, config = {}) {
  await ensureInit();

  const imageData = await _blobToImageData(blob);

  const {
    colorMode        = 'color',
    mode             = 'spline',
    filterSpeckle    = 4,
    cornerThreshold  = 60,
    lengthThreshold  = 4,
    maxIterations    = 10,
    spliceThreshold  = 45,
    pathPrecision    = 8,
    colorPrecision   = 6,
    layerDifference  = 16,
    invert           = false,
    backgroundColor  = undefined,
    pathFill         = undefined,
    scale            = 1,
  } = config;

  const deg2rad = d => d * Math.PI / 180;
  const isColor = colorMode === 'color';

  const converterParams = {
    mode,
    filterSpeckle,
    cornerThreshold: deg2rad(cornerThreshold),
    lengthThreshold,
    maxIterations,
    spliceThreshold: deg2rad(spliceThreshold),
    pathPrecision,
    ...(isColor ? { colorPrecision, layerDifference } : {}),
  };

  const options = {
    invert: !isColor && invert,
    backgroundColor,
    pathFill,
    attributes: undefined,
    scale,
  };

  const converter = isColor
    ? new ColorImageConverter(imageData, converterParams, options)
    : new BinaryImageConverter(imageData, converterParams, options);
  converter.init();

  return new Promise(resolve => {
    const tick = typeof requestAnimationFrame !== 'undefined'
      ? cb => requestAnimationFrame(cb)
      : cb => setTimeout(cb, 0);

    function step() {
      const done = converter.tick();
      if (done) {
        const svg = converter.getResult();
        converter.free();
        resolve(svg);
      } else {
        tick(step);
      }
    }
    tick(step);
  });
}

function _blobToImageData(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = e => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
