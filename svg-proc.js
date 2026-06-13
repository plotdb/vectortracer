/**
 * SVG post-processing utilities for vectortracer output.
 *
 * mergePaths() requires paper.js:
 *   - Browser : load paper.js before calling (sets window.paper), or pass { paper } explicitly.
 *   - Node.js : install paper-jsdom; it is auto-imported when no paper instance is passed.
 */

/** Parse #rgb or #rrggbb to [r, g, b]. */
function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** [r, g, b] → "#rrggbb". */
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** Euclidean RGB distance. */
function rgbDist(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/**
 * Extract all unique fill hex colors from an SVG string.
 * @param {string} svg
 * @returns {string[]} lowercase hex strings, e.g. ["#ff0000", ...]
 */
export function extractColors(svg) {
  const seen = new Set();
  for (const m of svg.matchAll(/fill="(#[0-9a-fA-F]{3,8})"/g)) {
    seen.add(m[1].toLowerCase());
  }
  return [...seen];
}

/**
 * Reduce the number of fill colors in an SVG string using agglomerative clustering.
 *
 * Two stopping criteria — both must hold before we stop merging:
 *   1. All remaining cluster pairs are at RGB distance ≥ mergeThreshold.
 *   2. The number of clusters is ≤ maxColors.
 * If either fails the closest pair is merged (weighted centroid).
 *
 * @param {string} svg
 * @param {object} [opts]
 * @param {number} [opts.maxColors=8]        Max output colors (hard cap).
 * @param {number} [opts.mergeThreshold=10]  Always merge pairs closer than this (≈ sqrt(3×6²)).
 * @returns {string} SVG with remapped fill colors.
 */
export function reduceColors(svg, { maxColors = 8, mergeThreshold = 10 } = {}) {
  const hexColors = extractColors(svg);
  if (hexColors.length === 0) return svg;

  // Count occurrences so the weighted centroid favours dominant colours.
  const counts = Object.fromEntries(hexColors.map(hex => {
    const re = new RegExp(`fill="${hex}"`, 'gi');
    return [hex, (svg.match(re) ?? []).length];
  }));

  // Each cluster: { rgb: [r,g,b], weight: number, members: string[] }
  let clusters = hexColors.map(hex => ({
    rgb: hexToRgb(hex),
    weight: counts[hex] || 1,
    members: [hex],
  }));

  /** Find the index pair with the smallest inter-cluster RGB distance. */
  function closestPair() {
    let minDist = Infinity, a = -1, b = -1;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = rgbDist(clusters[i].rgb, clusters[j].rgb);
        if (d < minDist) { minDist = d; a = i; b = j; }
      }
    }
    return { minDist, a, b };
  }

  /** Merge clusters[a] and clusters[b] into a new weighted-centroid cluster. */
  function merge(a, b) {
    const ca = clusters[a], cb = clusters[b];
    const w = ca.weight + cb.weight;
    clusters = clusters
      .filter((_, i) => i !== a && i !== b)
      .concat({
        rgb: [
          (ca.rgb[0] * ca.weight + cb.rgb[0] * cb.weight) / w,
          (ca.rgb[1] * ca.weight + cb.rgb[1] * cb.weight) / w,
          (ca.rgb[2] * ca.weight + cb.rgb[2] * cb.weight) / w,
        ],
        weight: w,
        members: [...ca.members, ...cb.members],
      });
  }

  while (clusters.length > 1) {
    const { minDist, a, b } = closestPair();
    // Stop only when BOTH conditions are satisfied.
    if (minDist >= mergeThreshold && clusters.length <= maxColors) break;
    merge(a, b);
  }

  // Build original-hex → new-hex map.
  const colorMap = {};
  for (const cluster of clusters) {
    const newHex = rgbToHex(cluster.rgb);
    for (const orig of cluster.members) colorMap[orig] = newHex;
  }

  // Replace all fill="..." occurrences in one pass.
  return svg.replace(/fill="(#[0-9a-fA-F]{3,8})"/gi, (_, hex) => {
    return `fill="${colorMap[hex.toLowerCase()] ?? hex}"`;
  });
}

// ─── mergePaths ───────────────────────────────────────────────────────────────

/** Extract SVG canvas dimensions from width/height attrs or viewBox. */
function _svgDimensions(svg) {
  const wm = svg.match(/\bwidth="([^"]+)"/);
  const hm = svg.match(/\bheight="([^"]+)"/);
  const vm = svg.match(/\bviewBox="([^"]+)"/);
  if (wm && hm) return { w: parseFloat(wm[1]), h: parseFloat(hm[1]) };
  if (vm) {
    const p = vm[1].split(/[\s,]+/).map(Number);
    return { w: p[2], h: p[3] };
  }
  return { w: 1000, h: 1000 };
}

/** Resolve fill walking up the parent chain (paper items can inherit fill). */
function _resolvedFill(item) {
  let cur = item;
  while (cur) {
    if (cur.fillColor !== null) return cur.fillColor;
    cur = cur.parent;
  }
  return null;
}

/** Boolean-unite two paths; returns united Path or null if not useful. */
function _tryMerge(scope, a, b) {
  const maxArea = Math.max(Math.abs(a.area), Math.abs(b.area));
  const united = a.unite(b);
  if (!(united instanceof scope.Path)) { united.remove(); return null; }
  const grow = maxArea > 0 ? (Math.abs(united.area) - maxArea) / maxArea : 0;
  if (grow < 1e-4) { united.remove(); return null; }
  united.fillColor = a.fillColor;
  return united;
}

/**
 * Resolve the paper.js instance for the current environment.
 * Browser : pass { paper } explicitly or load paper.js so that window.paper is set.
 * Node.js : paper-jsdom is auto-imported when paperArg is omitted.
 */
async function _resolvePaper(paperArg) {
  if (paperArg) return paperArg;
  if (typeof window !== 'undefined') {
    if (!window.paper) throw new Error(
      'mergePaths: paper.js must be available as window.paper in browser context. ' +
      'Load it via <script src="paper-full.min.js"></script> or pass { paper } explicitly.'
    );
    return window.paper;
  }
  // Node.js — auto-import paper-jsdom
  const mod = await import('paper-jsdom');
  return mod.default ?? mod;
}

/**
 * Merge adjacent same-color simple paths in an SVG using paper.js boolean unite().
 * CompoundPaths are left untouched (their evenodd topology is meaningful).
 *
 * @param {string} svg - SVG markup string (typically from trace()).
 * @param {object} [opts]
 * @param {object} [opts.paper] - paper.js namespace. Auto-resolved when omitted:
 *   browser → window.paper, Node.js → paper-jsdom (auto-imported).
 * @returns {Promise<string>} SVG markup with merged paths.
 */
export async function mergePaths(svg, { paper: paperArg } = {}) {
  const paper = await _resolvePaper(paperArg);
  const { w, h } = _svgDimensions(svg);

  const scope = new paper.PaperScope();
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    scope.setup(canvas);
  } else {
    scope.setup(new scope.Size(w, h));
  }

  scope.project.importSVG(svg, { expandShapes: true });

  const rootGroup = scope.project.activeLayer.children[0];
  const allItems = Array.from(rootGroup.children).filter(
    c => c instanceof scope.Path || c instanceof scope.CompoundPath
  );

  // Flatten into activeLayer and ensure each item carries its own fillColor.
  const layer = scope.project.activeLayer;
  for (const item of allItems) {
    const fill = _resolvedFill(item);
    if (fill) item.fillColor = fill;
    layer.addChild(item);
  }

  // Only merge simple Paths; CompoundPaths stay as-is.
  const simplePaths = allItems.filter(c => c instanceof scope.Path);
  const groups = {};
  for (const path of simplePaths) {
    const key = path.fillColor ? path.fillColor.toCSS(true) : 'none';
    (groups[key] ??= []).push(path);
  }

  for (const members of Object.values(groups)) {
    let changed = true;
    while (changed) {
      changed = false;
      outer:
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const a = members[i], b = members[j];
          if (!a.bounds.expand(1).intersects(b.bounds)) continue;
          const united = _tryMerge(scope, a, b);
          if (!united) continue;
          united.insertBelow(a.index < b.index ? a : b);
          a.remove(); b.remove();
          members.splice(j, 1);
          members.splice(i, 1, united);
          changed = true;
          break outer;
        }
      }
    }
  }

  return scope.project.exportSVG({ asString: true });
}
