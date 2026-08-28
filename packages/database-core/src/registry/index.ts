import { DbError, unknownEngineError } from '../errors';
import type { DatabaseEngine } from '../models';
import type { DatabaseProvider } from '../contracts/provider';

/** Composition root registry. Core never registers concrete providers itself. */
export class ProviderRegistry {
  private readonly providers = new Map<DatabaseEngine, DatabaseProvider>();

  public constructor(providers: Iterable<DatabaseProvider> = []) {
    for (const provider of providers) {
      this.register(provider);
    }
  }

  public register(provider: DatabaseProvider): void {
    if (this.providers.has(provider.engine)) {
      throw new DbError({
        category: 'conflict',
        message: 'Database provider is already registered',
      });
    }
    this.providers.set(provider.engine, provider);
  }

  public get(engine: string): DatabaseProvider {
    const provider = this.providers.get(engine as DatabaseEngine);
    if (!provider) {
      throw unknownEngineError(engine);
    }
    return provider;
  }

  public has(engine: string): boolean {
    return this.providers.has(engine as DatabaseEngine);
  }
}
