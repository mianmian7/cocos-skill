const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

function isBase64String(value: string): boolean {
  return Boolean(value) && value.length % 4 === 0 && BASE64_REGEX.test(value);
}

export function encodeUuid(uuid: string): string {
  return uuid.includes('@')
    ? Buffer.from(uuid, 'utf8').toString('base64')
    : uuid;
}

export function decodeUuid(encodedUuid: string): string {
  if (!isBase64String(encodedUuid)) {
    return encodedUuid;
  }

  const decoded = Buffer.from(encodedUuid, 'base64').toString('utf8');
  return decoded.includes('@') ? decoded : encodedUuid;
}
