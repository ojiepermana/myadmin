const UUID_V7_MAX_TIMESTAMP = 0xffff_ffff_ffff;
const RANDOM_BITS = 74n;
const RANDOM_MASK = (1n << RANDOM_BITS) - 1n;
const RANDOM_B_MASK = (1n << 62n) - 1n;

let lastTimestamp = -1;
let lastRandom = 0n;

function randomBits(): bigint {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);

  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value & RANDOM_MASK;
}

function writeTimestamp(bytes: Uint8Array, timestamp: number): void {
  let value = BigInt(timestamp);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(value & 0xffn);
    value >>= 8n;
  }
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Create a RFC 9562 UUID version 7 with monotonic ordering within a process. */
export function createUuidV7(timestamp = Date.now()): string {
  if (!Number.isInteger(timestamp) || timestamp < 0 || timestamp > UUID_V7_MAX_TIMESTAMP) {
    throw new RangeError('UUIDv7 timestamp must be a non-negative integer within 48 bits');
  }

  const nextTimestamp = Math.max(timestamp, lastTimestamp);
  if (nextTimestamp === lastTimestamp) {
    lastRandom = (lastRandom + 1n) & RANDOM_MASK;
    if (lastRandom === 0n) {
      if (nextTimestamp === UUID_V7_MAX_TIMESTAMP) {
        throw new RangeError('UUIDv7 timestamp space is exhausted');
      }
      lastTimestamp = nextTimestamp + 1;
      lastRandom = randomBits();
    }
  } else {
    lastTimestamp = nextTimestamp;
    lastRandom = randomBits();
  }

  const randomA = (lastRandom >> 62n) & 0xfffn;
  const randomB = lastRandom & RANDOM_B_MASK;
  const bytes = new Uint8Array(16);
  writeTimestamp(bytes, lastTimestamp);
  bytes[6] = 0x70 | Number(randomA >> 8n);
  bytes[7] = Number(randomA & 0xffn);
  bytes[8] = 0x80 | Number((randomB >> 56n) & 0x3fn);
  for (let index = 9; index < 16; index += 1) {
    const shift = BigInt((15 - index) * 8);
    bytes[index] = Number((randomB >> shift) & 0xffn);
  }

  return formatUuid(bytes);
}

export const uuidv7 = createUuidV7;
