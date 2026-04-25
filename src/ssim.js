/**
 * Structural Similarity Index Measure (SSIM)
 * Simplified implementation for grayscale or RGB images.
 */

export function ssim(img1, img2) {
  const { data: d1, width, height } = img1;
  const { data: d2 } = img2;

  // We'll compute a global SSIM by averaging local SSIM values on 8x8 blocks.
  const windowSize = 8;
  const K1 = 0.01;
  const K2 = 0.03;
  const L = 255;
  const C1 = (K1 * L) ** 2;
  const C2 = (K2 * L) ** 2;

  let totalSsim = 0;
  let numWindows = 0;

  for (let y = 0; y < height - windowSize; y += windowSize) {
    for (let x = 0; x < width - windowSize; x += windowSize) {
      // For each window, compute statistics for R, G, B separately and average them.
      let windowSsim = 0;
      for (let c = 0; c < 3; c++) { // R, G, B
        let mu1 = 0, mu2 = 0;
        let sigma1_2 = 0, sigma2_2 = 0, sigma12 = 0;

        // First pass for means
        for (let wy = 0; wy < windowSize; wy++) {
          for (let wx = 0; wx < windowSize; wx++) {
            const baseIdx = ((y + wy) * width + (x + wx)) * 4;
            const idx = baseIdx + c;
            const a1 = d1[baseIdx + 3] / 255;
            const a2 = d2[baseIdx + 3] / 255;
            mu1 += (d1[idx] * a1 + 255 * (1 - a1));
            mu2 += (d2[idx] * a2 + 255 * (1 - a2));
          }
        }
        mu1 /= (windowSize * windowSize);
        mu2 /= (windowSize * windowSize);

        // Second pass for variances and covariance
        for (let wy = 0; wy < windowSize; wy++) {
          for (let wx = 0; wx < windowSize; wx++) {
            const idx = ((y + wy) * width + (x + wx)) * 4 + c;
            // Handle potential alpha by premultiplying or assuming white background
            // Here we assume white background for both if alpha is present
            const a1 = d1[((y + wy) * width + (x + wx)) * 4 + 3] / 255;
            const a2 = d2[((y + wy) * width + (x + wx)) * 4 + 3] / 255;
            
            const v1 = (d1[idx] * a1 + 255 * (1 - a1)) - mu1;
            const v2 = (d2[idx] * a2 + 255 * (1 - a2)) - mu2;
            sigma1_2 += v1 * v1;
            sigma2_2 += v2 * v2;
            sigma12 += v1 * v2;
          }
        }
        sigma1_2 /= (windowSize * windowSize - 1);
        sigma2_2 /= (windowSize * windowSize - 1);
        sigma12 /= (windowSize * windowSize - 1);

        const ssimVal = ((2 * mu1 * mu2 + C1) * (2 * sigma12 + C2)) /
                        ((mu1 ** 2 + mu2 ** 2 + C1) * (sigma1_2 + sigma2_2 + C2));
        windowSsim += ssimVal;
      }
      totalSsim += windowSsim / 3;
      numWindows++;
    }
  }

  return totalSsim / numWindows;
}

/**
 * Faster Mean Squared Error (MSE)
 */
export function mse(img1, img2) {
  const d1 = img1.data;
  const d2 = img2.data;
  let error = 0;
  for (let i = 0; i < d1.length; i += 4) {
    const a1 = d1[i+3] / 255;
    const a2 = d2[i+3] / 255;
    for (let c = 0; c < 3; c++) {
      const v1 = d1[i+c] * a1 + 255 * (1 - a1);
      const v2 = d2[i+c] * a2 + 255 * (1 - a2);
      const diff = v1 - v2;
      error += diff * diff;
    }
  }
  return error / (img1.width * img1.height * 3);
}
