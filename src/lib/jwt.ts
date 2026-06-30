export async function generateGitHubAppJWT(appId: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: now - 60,
    exp: now + 600,
    iss: appId,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const isPkcs1 = pem.includes('BEGIN RSA PRIVATE KEY');
  const pemContents = pem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/, '')
    .replace(/-----END (RSA )?PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const binaryString = atob(pemContents);
  const keyBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    keyBytes[i] = binaryString.charCodeAt(i);
  }

  const pkcs8Bytes = isPkcs1 ? convertPkcs1ToPkcs8(keyBytes) : keyBytes;

  return crypto.subtle.importKey(
    'pkcs8',
    pkcs8Bytes.buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function convertPkcs1ToPkcs8(pkcs1Bytes: Uint8Array): Uint8Array {
  const algorithmId = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const octetString = wrapInAsn1(0x04, pkcs1Bytes);
  const inner = new Uint8Array(version.length + algorithmId.length + octetString.length);
  inner.set(version, 0);
  inner.set(algorithmId, version.length);
  inner.set(octetString, version.length + algorithmId.length);
  return wrapInAsn1(0x30, inner);
}

function wrapInAsn1(tag: number, data: Uint8Array): Uint8Array {
  const length = data.length;
  let header: Uint8Array;

  if (length < 128) {
    header = new Uint8Array([tag, length]);
  } else if (length < 256) {
    header = new Uint8Array([tag, 0x81, length]);
  } else if (length < 65536) {
    header = new Uint8Array([tag, 0x82, (length >> 8) & 0xff, length & 0xff]);
  } else {
    header = new Uint8Array([
      tag,
      0x83,
      (length >> 16) & 0xff,
      (length >> 8) & 0xff,
      length & 0xff,
    ]);
  }

  const result = new Uint8Array(header.length + data.length);
  result.set(header, 0);
  result.set(data, header.length);
  return result;
}

function base64UrlEncode(data: string | ArrayBuffer): string {
  let base64: string;
  if (typeof data === 'string') {
    base64 = btoa(data);
  } else {
    const bytes = new Uint8Array(data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
