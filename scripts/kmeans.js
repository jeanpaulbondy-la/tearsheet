// k-means clustering over LAB points. Distance is squared Euclidean in LAB
// space (no need for the real Euclidean distance since we only ever compare
// distances to each other, never use the magnitude itself).

function distSq(a, b) {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return dl * dl + da * da + db * db;
}

// k-means++ initialization: pick the first centroid uniformly at random,
// then each subsequent centroid with probability proportional to its
// squared distance from the nearest centroid already chosen. This spreads
// initial centroids out across distinct colors instead of risking several
// random picks landing in the same dominant region (which plain random
// init can do, and which wastes a cluster).
function initCentroids(points, k) {
  const centroids = [points[Math.floor(Math.random() * points.length)]];

  while (centroids.length < k) {
    const distances = points.map((p) =>
      Math.min(...centroids.map((c) => distSq(p, c)))
    );
    const total = distances.reduce((sum, d) => sum + d, 0);
    let threshold = Math.random() * total;
    let chosen = points[points.length - 1];
    for (let i = 0; i < points.length; i++) {
      threshold -= distances[i];
      if (threshold <= 0) {
        chosen = points[i];
        break;
      }
    }
    centroids.push(chosen);
  }

  return centroids;
}

// Runs Lloyd's algorithm on `points` (an array of [L, a, b] triples),
// returning `k` clusters as { centroid: [L, a, b], count } sorted by
// nothing in particular — callers decide how to rank/select clusters.
function kmeans(points, k, { maxIterations = 20, tolerance = 1e-3 } = {}) {
  let centroids = initCentroids(points, k);
  let assignments = new Array(points.length).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assignment step: each point gets assigned to its nearest centroid
    for (let i = 0; i < points.length; i++) {
      let bestDist = Infinity;
      let bestIdx = 0;
      for (let j = 0; j < centroids.length; j++) {
        const d = distSq(points[i], centroids[j]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = j;
        }
      }
      assignments[i] = bestIdx;
    }

    // Update step: recompute each centroid as the mean of its assigned points
    const oldCentroids = centroids.map((c) => [...c]);
    const sums = centroids.map(() => [0, 0, 0]);
    const counts = new Array(k).fill(0);

    for (let i = 0; i < points.length; i++) {
      const c = assignments[i];
      sums[c][0] += points[i][0];
      sums[c][1] += points[i][1];
      sums[c][2] += points[i][2];
      counts[c]++;
    }

    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) {
        centroids[j] = [
          sums[j][0] / counts[j],
          sums[j][1] / counts[j],
          sums[j][2] / counts[j],
        ];
      }
    }

    // Convergence check: if centroids moved less than tolerance, stop early
    let totalShift = 0;
    for (let j = 0; j < k; j++) {
      totalShift += distSq(oldCentroids[j], centroids[j]);
    }
    if (totalShift < tolerance) break;
  }

  const counts = new Array(k).fill(0);
  for (const a of assignments) counts[a]++;

  return centroids.map((centroid, i) => ({ centroid, count: counts[i] }));
}

module.exports = { kmeans, distSq };
