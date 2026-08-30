import type { ConnectionDescriptor } from '../contracts/connection-descriptor';

/**
 * Short lived provider input. The secret is deliberately a non enumerable
 * getter, so normal object serialization cannot carry it across a boundary.
 */
export class ConnectionContext {
  public readonly descriptor: ConnectionDescriptor;
  public readonly secret!: string | undefined;

  public constructor(descriptor: ConnectionDescriptor, secret?: string) {
    this.descriptor = { ...descriptor };

    Object.defineProperty(this, 'secret', {
      configurable: false,
      enumerable: false,
      get: () => secret,
    });
  }

  public toJSON(): { descriptor: ConnectionDescriptor } {
    return { descriptor: this.descriptor };
  }
}
