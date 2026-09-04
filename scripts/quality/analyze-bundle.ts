/**
 * Reports what the production initial bundle is made of, and how much room is
 * left under the configured budget.
 *
 * The audit found the initial bundle sitting inside one percent of the warning
 * threshold with no recorded analysis, so the next small dependency would have
 * broken the production build with nobody able to say what the bundle already
 * held (spec 0057 AC-15). Run `bun run build:web` first; this reads its output.
 *
 * Usage:
 *   bun run analyze:bundle              report only
 *   bun run analyze:bundle --check      also fail when headroom is below the floor
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = 'dist/web/browser';
const INDEX = join(DIST, 'index.html');

/** Minimum share of the warning budget that must stay unused. */
const MIN_HEADROOM_RATIO = 0.15;

interface Asset {
  readonly name: string;
  readonly bytes: number;
}

function parseSize(value: string): number {
  const match = /^([\d.]+)\s*(kB|MB|B)$/i.exec(value.trim());
  if (!match) throw new Error(`Budget value is not a size: ${value}`);
  const amount = Number(match[1]);
  const unit = (match[2] ?? 'B').toLowerCase();
  return unit === 'mb' ? amount * 1_000_000 : unit === 'kb' ? amount * 1_000 : amount;
}

function formatKb(bytes: number): string {
  return `${(bytes / 1_000).toFixed(2)} kB`;
}

async function warningBudget(): Promise<number> {
  const raw = await readFile('angular.json', 'utf8');
  const config = JSON.parse(raw) as {
    projects: Record<
      string,
      {
        architect: {
          build: {
            configurations: Record<
              string,
              { budgets?: { type: string; maximumWarning?: string }[] }
            >;
          };
        };
      }
    >;
  };
  const budgets = config.projects['web']?.architect.build.configurations['production']?.budgets;
  const initial = budgets?.find((budget) => budget.type === 'initial');
  if (!initial?.maximumWarning) throw new Error('No initial maximumWarning budget is configured.');
  return parseSize(initial.maximumWarning);
}

/**
 * The initial bundle is exactly what `index.html` pulls in eagerly. Everything
 * else in the output directory is a lazy chunk the router fetches on demand.
 */
async function initialAssets(): Promise<Asset[]> {
  const html = await readFile(INDEX, 'utf8');
  const names = new Set<string>();
  for (const match of html.matchAll(/(?:src|href)="\.?\/?([\w.-]+\.(?:js|css))"/g)) {
    const name = match[1];
    if (name) names.add(name);
  }
  // Modulepreload links are the eagerly loaded shared chunks.
  for (const match of html.matchAll(/rel="modulepreload"[^>]*href="\.?\/?([\w.-]+\.js)"/g)) {
    const name = match[1];
    if (name) names.add(name);
  }
  const assets: Asset[] = [];
  for (const name of names) {
    assets.push({ name, bytes: (await stat(join(DIST, name))).size });
  }
  return assets.sort((left, right) => right.bytes - left.bytes);
}

/** Names the libraries a chunk carries, so a large chunk is not just a hash. */
async function marker(name: string): Promise<string> {
  const text = await readFile(join(DIST, name), 'utf8');
  const libraries: [string, RegExp][] = [
    ['@angular/core', /ɵɵdefineInjectable|NG0\d{3}/],
    ['@angular/router', /RouterOutlet|ActivatedRoute/],
    ['@angular/forms', /NgControlStatus|FormControlName/],
    ['@ojiepermana/angular', /ojiepermana|opNavigation|MenuItem/i],
    ['codemirror', /@codemirror|EditorView|lezer/],
    ['rxjs', /Observable|Subscription/],
  ];
  const found = libraries.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  return found.length > 0 ? found.join(', ') : 'app code';
}

async function main(): Promise<void> {
  try {
    await readdir(DIST);
  } catch {
    console.error(`No build output at ${DIST}. Run \`bun run build:web\` first.`);
    process.exit(1);
  }

  const [assets, budget] = await Promise.all([initialAssets(), warningBudget()]);
  const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);
  const headroom = budget - total;
  const ratio = headroom / budget;

  console.log('Initial bundle composition\n');
  for (const asset of assets) {
    const share = ((asset.bytes / total) * 100).toFixed(1);
    console.log(
      `  ${formatKb(asset.bytes).padStart(10)}  ${share.padStart(5)}%  ${asset.name}  (${await marker(asset.name)})`,
    );
  }
  console.log(`\n  ${formatKb(total).padStart(10)}          initial total`);
  console.log(`  ${formatKb(budget).padStart(10)}          warning budget`);
  console.log(
    `  ${formatKb(headroom).padStart(10)}  ${(ratio * 100).toFixed(1).padStart(5)}%  headroom\n`,
  );

  if (process.argv.includes('--check') && ratio < MIN_HEADROOM_RATIO) {
    console.error(
      `Headroom is ${(ratio * 100).toFixed(1)}%, below the ${MIN_HEADROOM_RATIO * 100}% floor. ` +
        'Shrink the initial bundle or raise the budget deliberately.',
    );
    process.exit(1);
  }
}

await main();
