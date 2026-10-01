import 'server-only';

import { createPublicKey, createVerify } from 'node:crypto';

type FirebaseTokenPayload = {
  aud?: string;
  iss?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  email?: string;
};

let certCache: { expiresAt: number; certs: Record<string, string> } | null = null;

function decodeBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function parseJsonPart<T>(value: string): T {
  return JSON.parse(decodeBase64Url(value).toString('utf8')) as T;
}

async function getFirebaseCerts() {
  if (certCache && certCache.expiresAt > Date.now()) return certCache.certs;
  const response = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com', {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('UNAUTHORIZED');
  const cacheControl = response.headers.get('cache-control') ?? '';
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] ?? 3600);
  const certs = await response.json() as Record<string, string>;
  certCache = { certs, expiresAt: Date.now() + Math.max(60, maxAge - 60) * 1000 };
  return certs;
}

export async function authorizeAssistantRequest(request: Request): Promise<FirebaseTokenPayload> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('UNAUTHORIZED');
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('UNAUTHORIZED');

  const decodedHeader = parseJsonPart<{ alg?: string; kid?: string }>(parts[0]);
  if (decodedHeader.alg !== 'RS256' || !decodedHeader.kid) throw new Error('UNAUTHORIZED');
  const cert = (await getFirebaseCerts())[decodedHeader.kid];
  if (!cert) throw new Error('UNAUTHORIZED');

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  const valid = verifier.verify(createPublicKey(cert), decodeBase64Url(parts[2]));
  if (!valid) throw new Error('UNAUTHORIZED');

  const payload = parseJsonPart<FirebaseTokenPayload>(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new Error('UNAUTHORIZED');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('UNAUTHORIZED');
  if (!payload.sub || payload.sub.length > 128) throw new Error('UNAUTHORIZED');
  if (!payload.exp || payload.exp <= now) throw new Error('UNAUTHORIZED');
  if (!payload.iat || payload.iat > now + 300) throw new Error('UNAUTHORIZED');
  return payload;
}
