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
import { ssim, mse } from './ssim.js';

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
 * @param {Blob|ImageData} source - Any image format the browser can decode (PNG, JPEG, WebP, …) or ImageData.
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
 * @param {boolean} [config.sync=false]          - Run synchronously (blocks UI).
 * @returns {Promise<string>|string} SVG markup string
 */
export async function trace(source, config = {}) {
  await ensureInit();

  const imageData = (source instanceof ImageData) ? source : await _blobToImageData(source);

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
    sync             = false,
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

  if (sync) {
    while (!converter.tick());
    const svg = converter.getResult();
    converter.free();
    return svg;
  }

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

/**
 * Optimize configuration to minimize difference between original and SVG.
 */
export async function optimize(blob, config = {}, onProgress) {
  const originalImageData = await _blobToImageData(blob);
  const { width, height } = originalImageData;

  // Parameters to optimize
  const params = [
    { key: 'filterSpeckle', min: 4, max: 32, step: 1, type: 'int' }, // Min 2 to avoid noise blowup
    { key: 'cornerThreshold', min: 0, max: 180, step: 10, type: 'float' },
    { key: 'lengthThreshold', min: 0, max: 10, step: 0.5, type: 'float' },
    { key: 'maxIterations', min: 1, max: 20, step: 1, type: 'int' },
    { key: 'spliceThreshold', min: 0, max: 180, step: 10, type: 'float' },
  ];

  if (config.colorMode !== 'bw') {
    params.push({ key: 'colorPrecision', min: 1, max: 8, step: 1, type: 'int' });
    params.push({ key: 'layerDifference', min: 0, max: 64, step: 4, type: 'int' });
  }

  let currentConfig = { ...config, sync: true, scale: 1 };
  let bestConfig = { ...currentConfig };
  let bestScore = -Infinity;

  const evaluate = async (cfg) => {
    const testCfg = { ...cfg, scale: 1, pathPrecision: 8 };
    const svg = await trace(originalImageData, testCfg);
    const renderedData = await _svgToImageData(svg, width, height);
    
    const s = ssim(originalImageData, renderedData);
    const m = mse(originalImageData, renderedData);
    
    // Balanced Score: 
    // 1. Primary: SSIM (0~1)
    // 2. Secondary: MSE (normalized to roughly 0~1 range by dividing by 10000)
    // 3. Penalty: Complexity (minus 0.001 for every 10KB of SVG)
    const complexityPenalty = svg.length / 10240 * 0.001;
    return s - (m / 10000) - complexityPenalty;
  };

  bestScore = await evaluate(bestConfig);

  // 1. Initial Global Coarse Sweep: Find a better starting point for each param
  for (const param of params) {
    const samples = 4; // Check 4 points across the entire range
    for (let i = 0; i <= samples; i++) {
      const val = param.min + (param.max - param.min) * (i / samples);
      const testVal = param.type === 'int' ? Math.round(val) : val;
      const testConfig = { ...bestConfig, [param.key]: testVal };
      const score = await evaluate(testConfig);
      if (score > bestScore) {
        bestScore = score;
        bestConfig = testConfig;
      }
    }
  }

  // 2. Directional Search with Momentum
  const passes = 3;
  const totalSteps = params.length * passes;
  let currentStep = 0;

  for (let pass = 0; pass < passes; pass++) {
    // Reduce step size each pass for fine-tuning
    const stepMultiplier = 1 / (pass + 1);

    for (const param of params) {
      currentStep++;
      if (onProgress) onProgress({
        progress: currentStep / totalSteps,
        currentConfig: bestConfig,
        bestScore
      });

      const baseStep = param.step * stepMultiplier;
      
      // Try both directions
      for (const dir of [-1, 1]) {
        let momentum = 1;
        let improved = true;
        
        while (improved) {
          improved = false;
          const offset = dir * baseStep * momentum;
          const nextVal = bestConfig[param.key] + offset;
          
          if (nextVal >= param.min && nextVal <= param.max) {
            const testVal = param.type === 'int' ? Math.round(nextVal) : nextVal;
            const testConfig = { ...bestConfig, [param.key]: testVal };
            const score = await evaluate(testConfig);
            
            if (score > bestScore) {
              bestScore = score;
              bestConfig = testConfig;
              improved = true;
              momentum *= 1.5; // Accelerate if we are going in the right direction
              if (onProgress) onProgress({
                progress: currentStep / totalSteps,
                currentConfig: bestConfig,
                bestScore
              });
            }
          }
        }
      }
    }
  }

  return bestConfig;
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

function _svgToImageData(svg, width, height) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(ctx.getImageData(0, 0, width, height));
    };
    img.onerror = e => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
