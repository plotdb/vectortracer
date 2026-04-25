/**
 * SVG post-processing utilities for vectortracer output.
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
