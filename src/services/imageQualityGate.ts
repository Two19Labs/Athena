/**
 * Image Quality Gate & Pre-Flight Assessment Service
 * Designed for harsh textile manufacturing shop-floor environments:
 * - Detects underexposure / dim loom shed lighting
 * - Detects specular glare from overhead fluorescent factory tubes
 * - Detects motion blur / camera shake
 * - Applies perspective auto-deskewing via Canvas
 */

export interface QualityReport {
  score: number; // 0.00 to 1.00
  passed: boolean;
  metrics: {
    meanLuminance: number; // 0 - 255
    glarePercentage: number; // 0 - 100%
    laplacianVariance: number; // Blur metric (> 100 = sharp)
    skewAngleDeg: number;
  };
  warnings: string[];
  recommendations: string[];
}

/**
 * Analyzes image pixels from an HTML Image or Canvas element
 */
export async function analyzeImageQuality(imageElement: HTMLImageElement | HTMLCanvasElement): Promise<QualityReport> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  if (!ctx) {
    return {
      score: 1.0,
      passed: true,
      metrics: { meanLuminance: 128, glarePercentage: 0, laplacianVariance: 200, skewAngleDeg: 0 },
      warnings: [],
      recommendations: []
    };
  }

  // Downsample to 400px width for fast client-side pre-flight check (< 50ms)
  const targetWidth = 400;
  const scale = targetWidth / imageElement.width;
  const targetHeight = Math.round(imageElement.height * scale);
  
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  ctx.drawImage(imageElement, 0, 0, targetWidth, targetHeight);

  const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const data = imgData.data;
  const totalPixels = targetWidth * targetHeight;

  let totalLuminance = 0;
  let glarePixels = 0;
  const grayPixels = new Uint8ClampedArray(totalPixels);

  // 1. Luminance & Glare Calculation
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Perceived grayscale luminance (ITU-R BT.601 standard)
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    totalLuminance += lum;
    grayPixels[i / 4] = lum;

    // Specular Glare Threshold: pure white hotspots from overhead tubes
    if (r > 245 && g > 245 && b > 240) {
      glarePixels++;
    }
  }

  const meanLuminance = Math.round(totalLuminance / totalPixels);
  const glarePercentage = Number(((glarePixels / totalPixels) * 100).toFixed(1));

  // 2. Laplacian Blur Kernel (3x3 high-pass filter)
  // [ 0,  1,  0 ]
  // [ 1, -4,  1 ]
  // [ 0,  1,  0 ]
  let laplacianSum = 0;
  let laplacianSumSq = 0;
  let count = 0;

  for (let y = 1; y < targetHeight - 1; y++) {
    for (let x = 1; x < targetWidth - 1; x++) {
      const idx = y * targetWidth + x;
      const val = 
        grayPixels[idx - targetWidth] +
        grayPixels[idx + targetWidth] +
        grayPixels[idx - 1] +
        grayPixels[idx + 1] -
        (4 * grayPixels[idx]);

      laplacianSum += val;
      laplacianSumSq += val * val;
      count++;
    }
  }

  const laplacianMean = laplacianSum / count;
  const laplacianVariance = Math.round((laplacianSumSq / count) - (laplacianMean * laplacianMean));

  // 3. Heuristic Skew Estimation
  // Detects if top/bottom edges have high contrast slopes
  const skewAngleDeg = estimateSkewAngle(grayPixels, targetWidth, targetHeight);

  // 4. Quality Score & Warnings Synthesis
  const warnings: string[] = [];
  const recommendations: string[] = [];
  let deductions = 0;

  if (meanLuminance < 45) {
    warnings.push("Low Light Detected (Loom alley is too dark)");
    recommendations.push("Turn on your phone flashlight or step under a loom inspection light.");
    deductions += 0.35;
  }

  if (glarePercentage > 12) {
    warnings.push(`Severe Glare (${glarePercentage}% of page washed out by tube lights)`);
    recommendations.push("Tilt phone 15 degrees to deflect overhead fluorescent reflections.");
    deductions += 0.30;
  }

  if (laplacianVariance < 95) {
    warnings.push("Motion Blur Detected (Text may be illegible)");
    recommendations.push("Rest your arms on the clipboard edge and hold camera steady.");
    deductions += 0.40;
  }

  if (Math.abs(skewAngleDeg) > 15) {
    warnings.push(`Perspective Skew (${Math.round(skewAngleDeg)}° angle)`);
    recommendations.push("Position the camera parallel to the paper for best table alignment.");
    deductions += 0.15;
  }

  const score = Math.max(0.1, Number((1.0 - deductions).toFixed(2)));
  const passed = score >= 0.60;

  return {
    score,
    passed,
    metrics: {
      meanLuminance,
      glarePercentage,
      laplacianVariance,
      skewAngleDeg
    },
    warnings,
    recommendations
  };
}

/**
 * Fast Sobel edge orientation histogram to estimate perspective tilt
 */
function estimateSkewAngle(gray: Uint8ClampedArray, width: number, height: number): number {
  let sampleCount = 0;
  let angleSum = 0;

  for (let y = 10; y < height - 10; y += 4) {
    for (let x = 10; x < width - 10; x += 4) {
      const idx = y * width + x;
      // Sobel horizontal and vertical gradients
      const gx = gray[idx + 1] - gray[idx - 1];
      const gy = gray[idx + width] - gray[idx - width];
      const mag = Math.hypot(gx, gy);

      if (mag > 60) {
        let theta = Math.atan2(gy, gx) * (180 / Math.PI);
        if (theta < -90) theta += 180;
        if (theta > 90) theta -= 180;
        
        // Accumulate near-horizontal line deviations
        if (Math.abs(theta) < 35) {
          angleSum += theta;
          sampleCount++;
        }
      }
    }
  }

  return sampleCount > 50 ? Number((angleSum / sampleCount).toFixed(1)) : 0;
}

/**
 * Creates an enhanced and deskewed copy of the image on an HTML Canvas
 */
export function enhanceAndDeskewImage(sourceImg: HTMLImageElement, angleDeg: number = 0): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return sourceImg.src;

  canvas.width = sourceImg.width;
  canvas.height = sourceImg.height;

  ctx.save();
  if (Math.abs(angleDeg) > 0.5) {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((-angleDeg * Math.PI) / 180);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
  }

  ctx.drawImage(sourceImg, 0, 0);
  ctx.restore();

  return canvas.toDataURL('image/jpeg', 0.92);
}
