// One-shot: knock out the dark background of the Founder Festival logo
// using a flood-fill from each corner. Connected near-neutral dark pixels
// become fully transparent; everything else (artwork) is preserved.
//
// Run:
//   pnpm exec tsx scripts/remove-logo-bg.ts
//   (outputs to public/images/founder-festival-logo.png, backing up the
//    original to public/images/founder-festival-logo.original.png)
// @ts-expect-error - pngjs ships no type declarations (no @types/pngjs); one-off image script.
import { PNG } from "pngjs";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";

const IN_PATH = "public/images/founder-festival-logo.png";
const BACKUP_PATH = "public/images/founder-festival-logo.original.png";

// A pixel is "background" if it's:
// - dark (sum of RGB <= MAX_SUM)  AND
// - near-neutral (max channel - min channel <= MAX_CHANNEL_SPREAD)
// AND connected via 4-neighbour adjacency to one of the four image corners.
//
// Tuning: artwork (red/gold smoke) has channel spread ≥ ~40 and total ≥ ~150.
// Background sampling shows: sums 60-90, spread ≤ ~6.
const MAX_SUM = 110;
const MAX_CHANNEL_SPREAD = 18;

function isBgPixel(r: number, g: number, b: number): boolean {
  if (r + g + b > MAX_SUM) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min > MAX_CHANNEL_SPREAD) return false;
  return true;
}

function main() {
  if (!existsSync(IN_PATH)) {
    console.error(`Missing ${IN_PATH}`);
    process.exit(1);
  }
  if (!existsSync(BACKUP_PATH)) {
    copyFileSync(IN_PATH, BACKUP_PATH);
    console.log(`Backed up original to ${BACKUP_PATH}`);
  }

  const png = PNG.sync.read(readFileSync(IN_PATH));
  const { width, height, data } = png;
  const total = width * height;
  const visited = new Uint8Array(total);

  // BFS queue stored as packed ints (y * width + x) for compactness
  const queue: number[] = [];

  function tryEnqueue(x: number, y: number) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    const p = idx * 4;
    if (!isBgPixel(data[p]!, data[p + 1]!, data[p + 2]!)) return;
    visited[idx] = 1;
    queue.push(idx);
  }

  // Seed with all four corners (and as a safety net, the full perimeter).
  for (let x = 0; x < width; x++) {
    tryEnqueue(x, 0);
    tryEnqueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    tryEnqueue(0, y);
    tryEnqueue(width - 1, y);
  }

  // 4-neighbour BFS
  while (queue.length > 0) {
    const idx = queue.shift()!;
    const x = idx % width;
    const y = (idx - x) / width;
    tryEnqueue(x + 1, y);
    tryEnqueue(x - 1, y);
    tryEnqueue(x, y + 1);
    tryEnqueue(x, y - 1);
  }

  // Apply: make every visited pixel fully transparent
  let knocked = 0;
  for (let i = 0; i < total; i++) {
    if (visited[i]) {
      data[i * 4 + 3] = 0;
      knocked++;
    }
  }

  writeFileSync(IN_PATH, PNG.sync.write(png));
  console.log(
    `Knocked out ${knocked} of ${total} pixels (${((knocked / total) * 100).toFixed(1)}%)`,
  );
}

main();
