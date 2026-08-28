import { Redaction } from '@myadmin/crypto';

export type MetricTagValue = string | number | boolean;
export type MetricTags = Readonly<Record<string, MetricTagValue>>;

export interface MetricSnapshot {
  readonly name: string;
  readonly tags: MetricTags;
  readonly count: number;
  readonly total: number;
}

interface MetricEntry {
  readonly name: string;
  readonly tags: MetricTags;
  count: number;
  total: number;
}

function metricKey(name: string, tags: MetricTags): string {
  const safeTags = Redaction.redactObject(tags);
  return `${name}:${JSON.stringify(Object.entries(safeTags).sort(([left], [right]) => left.localeCompare(right)))}`;
}

function copyTags(tags: MetricTags): MetricTags {
  return Object.freeze({ ...Redaction.redactObject(tags) });
}

export class Metrics {
  private readonly entries = new Map<string, MetricEntry>();

  public increment(name: string, tags: MetricTags = {}, amount = 1): void {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new RangeError('Metric increment must be a finite non-negative number');
    }

    const entry = this.entry(name, tags);
    entry.count += amount;
    entry.total += amount;
  }

  public observe(name: string, value: number, tags: MetricTags = {}): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError('Metric observation must be a finite non-negative number');
    }

    const entry = this.entry(name, tags);
    entry.count += 1;
    entry.total += value;
  }

  public get(name: string, tags: MetricTags = {}): MetricSnapshot | undefined {
    const entry = this.entries.get(metricKey(name, tags));
    return entry ? this.snapshotEntry(entry) : undefined;
  }

  public snapshot(): readonly MetricSnapshot[] {
    return [...this.entries.values()].map((entry) => this.snapshotEntry(entry));
  }

  public reset(): void {
    this.entries.clear();
  }

  private entry(name: string, tags: MetricTags): MetricEntry {
    const key = metricKey(name, tags);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { name, tags: copyTags(tags), count: 0, total: 0 };
      this.entries.set(key, entry);
    }
    return entry;
  }

  private snapshotEntry(entry: MetricEntry): MetricSnapshot {
    return {
      name: entry.name,
      tags: entry.tags,
      count: entry.count,
      total: entry.total,
    };
  }
}

export const metrics = new Metrics();

export const HTTP_REQUESTS_METRIC = 'http.requests' as const;
export const HTTP_REQUEST_DURATION_METRIC = 'http.request.duration_ms' as const;
