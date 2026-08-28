import type { DatabaseEngine } from '../models';

export const CAPABILITY_KEYS = [
  'schemas',
  'viewEditor',
  'explain',
  'cancelQuery',
  'backupRestore',
  'importExport',
  'principals',
  'grants',
  'tableComments',
  'generatedColumns',
  'identityColumns',
  'checkConstraints',
  'materializedViews',
  'vacuum',
  'rowLevelSecurity',
  'events',
  'binlog',
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export const V2_CAPABILITY_KEYS = [
  'materializedViews',
  'vacuum',
  'rowLevelSecurity',
  'events',
  'binlog',
] as const;

export type V2CapabilityKey = (typeof V2_CAPABILITY_KEYS)[number];

export type CapabilityMap = {
  [Key in CapabilityKey]: Key extends V2CapabilityKey ? false : boolean;
};

export type CapabilityReasons = Partial<Record<CapabilityKey, string>>;

/** Capability negotiation returned by a provider for one connection. */
export interface CapabilityDescription {
  engine: DatabaseEngine;
  version: string;
  capabilities: CapabilityMap;
  reasons?: CapabilityReasons;
}

export type Capability = CapabilityDescription;
export type CapabilityModel = CapabilityDescription;

export function createCapabilityDescription(
  description: CapabilityDescription,
): CapabilityDescription {
  return {
    engine: description.engine,
    version: description.version,
    capabilities: { ...description.capabilities },
    ...(description.reasons ? { reasons: { ...description.reasons } } : {}),
  };
}
