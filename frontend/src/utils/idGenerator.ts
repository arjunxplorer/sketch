/**
 * UUID v4 generator for client-side stroke IDs.
 * Uses crypto.getRandomValues for secure random generation.
 */

export function generateUUID(): string {
  // Use crypto API if available (browser/Node 15+)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback implementation of UUID v4
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Set version (4) and variant (RFC 4122)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Generate a short ID for debugging purposes.
 * Not guaranteed to be unique, but useful for logs.
 */
export function generateShortId(): string {
  return Math.random().toString(36).substring(2, 10);
}

