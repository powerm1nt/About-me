/**
 * Two small in-process caches, kept separate because they bound themselves differently.
 *
 * Auth sessions and OAuth states are small and uniform, so counting entries is enough. Rendered
 * page and article content varies from a few KB upwards, so that cache bounds itself by actual
 * bytes stored — under a count-based limit a handful of large pages could quietly exhaust memory.
 *
 * In-process means per-instance: a Cloud Run revision scaled to N instances holds N independent
 * caches. That is fine for page content (each instance just re-reads from GCS on a miss) and it is
 * why sessions are opaque random ids rather than anything an instance has to agree on — but it does
 * mean a signed-in user whose next request lands on a different instance is asked to sign in again.
 * The C# server had exactly this property; max_instance_count is low enough that it rarely shows.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
  sizeBytes: number;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private totalBytes = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly maxBytes = Number.POSITIVE_INFINITY
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      this.delete(key);
      return undefined;
    }

    // Re-insert so Map iteration order approximates least-recently-used for eviction below.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, sizeBytes = 1): void {
    this.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs, sizeBytes });
    this.totalBytes += sizeBytes;
    this.evictIfNeeded();
  }

  delete(key: string): void {
    const existing = this.entries.get(key);
    if (!existing) return;
    this.totalBytes -= existing.sizeBytes;
    this.entries.delete(key);
  }

  private evictIfNeeded(): void {
    // Map preserves insertion order, and get() re-inserts on hit, so the first key is the coldest.
    while (this.totalBytes > this.maxBytes && this.entries.size > 1) {
      const oldest = this.entries.keys().next();
      if (oldest.done) return;
      this.delete(oldest.value);
    }
  }
}

/** Rendered page and article content. 20 MB, 5 minutes — matches the old PageContentCache. */
export const pageCache = new TtlCache<unknown>(5 * 60 * 1000, 20 * 1024 * 1024);
