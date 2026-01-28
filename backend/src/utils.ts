function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 100) / 100;
}

export function checkGeofence(
  userLat: number,
  userLon: number,
  officeLat: number,
  officeLon: number,
  radiusMeters: number
): { status: 'PASS' | 'FAIL'; distance: number } {
  const distance = calculateDistance(userLat, userLon, officeLat, officeLon);
  const status = distance <= radiusMeters ? 'PASS' : 'FAIL';
  return { status, distance };
}

export function normalizeIp(ip: string | undefined | null): string {
  if (!ip) return '';
  const v = String(ip).trim();

  if (v === '::1') return '127.0.0.1';
  if (v.startsWith('::ffff:')) return v.replace('::ffff:', '');

  // x-forwarded-for kadang berisi "ip, proxy1, proxy2"
  if (v.includes(',')) return v.split(',')[0].trim();

  return v;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.').map((x) => Number(x));
  if (parts.length !== 4) return null;
  if (parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);

  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range);

  if (ipInt === null || rangeInt === null) return false;
  if (!Number.isFinite(bits) || bits < 0 || bits > 32) return false;

  const mask = bits === 0 ? 0 : (~((1 << (32 - bits)) - 1) >>> 0) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

export function isIPInOfficeNetwork(userIP: string, cidrs: string[]): boolean {
  const ip = normalizeIp(userIP);
  if (!ip) return false;
  return cidrs.some((c) => {
    try {
      return ipInCidr(ip, c);
    } catch {
      return false;
    }
  });
}

// Timestamp format aman untuk SQLite + konsisten untuk DATE() / strftime()
export function getCurrentTimestamp(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
  return local; // "YYYY-MM-DD HH:MM:SS"
}

export function getCurrentDate(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  return local; // "YYYY-MM-DD"
}
