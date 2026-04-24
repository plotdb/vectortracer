# vectortracer — fork notes

This is a fork of [AlansCodeLog/vectortracer](https://github.com/AlansCodeLog/vectortracer),
which provides WASM bindings to [Visioncortex's VTracer](https://github.com/visioncortex/vtracer).

## What this fork adds

- **`ColorImageConverter`** — color image tracing (the original only had `BinaryImageConverter`)
- **`api.js`** — high-level `trace(blob, config)` Promise API wrapping both converters
- **`vectortracer-global.js`** — load as a plain `<script>` without ES module syntax
- **`vectortracer.bundle.js`** — fully self-contained IIFE bundle with WASM inlined as base64
- SVG output now includes correct `width`, `height`, and `viewBox`

---

## Prerequisites

- [Rust + Cargo](https://rustup.rs/)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)
- Node.js (for the JS bundle step)

---

## Build

```bash
./build
```

This runs three steps in sequence:

1. **Clean** — removes `pkg/`
2. **wasm-pack** — compiles Rust → WASM, generates `pkg/vectortracer.js` and `pkg/vectortracer_bg.wasm`
3. **Copy + bundle** — copies `src/api.js` and `src/vectortracer-global.js` into `pkg/`, then generates `pkg/vectortracer.bundle.js` with WASM inlined

All build output lands in `pkg/`. Source files under `src/` are never modified.

---

## Output files

| File | Description |
|------|-------------|
| `pkg/vectortracer.js` | wasm-pack generated ES module glue |
| `pkg/vectortracer_bg.wasm` | compiled WASM binary |
| `pkg/api.js` | high-level ES module API |
| `pkg/vectortracer-global.js` | global script wrapper (`window.vectortracer`) |
| `pkg/index.bundle.js` | self-contained IIFE bundle, WASM inline |

---

## Usage

### Option A — ES module (`pkg/api.js`)

```html
<script type="module">
  import { trace } from './pkg/api.js';

  const blob = await fetch('image.png').then(r => r.blob());
  const svg  = await trace(blob, { colorMode: 'color' });
  document.body.innerHTML = svg;
</script>
```

### Option B — global script (`pkg/vectortracer-global.js`)

No `type="module"` needed. `api.js` is loaded lazily on first call.

```html
<script src="./pkg/vectortracer-global.js"></script>
<script>
  fetch('image.png')
    .then(r => r.blob())
    .then(blob => vectortracer.trace(blob, { colorMode: 'color' }))
    .then(svg  => { document.body.innerHTML = svg; });
</script>
```

### Option C — self-contained bundle (`pkg/index.bundle.js`)

Single file, no path dependencies. WASM is embedded as base64.

```html
<script src="./pkg/index.bundle.js"></script>
<script>
  fetch('image.png')
    .then(r => r.blob())
    .then(blob => vectortracer.trace(blob))
    .then(svg  => { document.body.innerHTML = svg; });
</script>
```

---

## `trace(blob, config)` config options

All fields are optional. Defaults match the vtracer CLI defaults.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `colorMode` | `'color'` \| `'bw'` | `'color'` | Color or binary tracing |
| `mode` | `'spline'` \| `'polygon'` \| `'none'` | `'spline'` | Path simplification mode |
| `filterSpeckle` | number | `4` | Minimum cluster size (px); smaller clusters are discarded |
| `cornerThreshold` | number (deg) | `60` | Corner detection angle threshold |
| `lengthThreshold` | number | `4` | Minimum path segment length |
| `maxIterations` | number | `10` | Curve-fitting max iterations |
| `spliceThreshold` | number (deg) | `45` | Splice angle threshold |
| `pathPrecision` | number | `8` | SVG coordinate decimal places |
| `colorPrecision` | number (1–8) | `6` | Color clustering precision — more colors ↑ (color mode only) |
| `layerDifference` | number | `16` | Layer separation strength (color mode only) |
| `invert` | boolean | `false` | Invert dark/light (bw mode only) |
| `backgroundColor` | string | `'white'` | SVG background color (any CSS value) |
| `pathFill` | string | auto | Override all path fill colors |
| `scale` | number | `1` | Scale factor applied to the output SVG |
