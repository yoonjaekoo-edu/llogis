import type { Env } from './env';

// 기존 multer(diskStorage) 업로드는 Workers 에서 사용할 수 없으므로
// R2 버킷(UPLOADS)으로 대체한다. 키 형식은 기존과 동일하게
// `profile-image-<timestamp>-<random><ext>` 를 유지한다.
// 저장 경로는 backend/uploads/ 아래 파일명과 1:1 대응되므로
// 기존 데이터는 wrangler r2 object put 으로 이전한다.

const ALLOWED_EXT = /jpeg|jpg|png|gif|webp|heic|heif/i;

export interface StoredUpload {
  key: string;
  url: string;
}

export function validateImageExt(filename: string): boolean {
  return ALLOWED_EXT.test(filename.split('.').pop() || '');
}

export function buildUploadKey(fieldName: string, originalName: string): string {
  const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const ext = originalName.includes('.') ? '.' + originalName.split('.').pop() : '';
  return `${fieldName}-${suffix}${ext}`;
}

export async function putImage(
  env: Env,
  fieldName: string,
  originalName: string,
  data: ArrayBuffer | ReadableStream,
  contentType: string,
): Promise<StoredUpload> {
  if (!env.UPLOADS) throw new Error('UPLOADS (R2) binding is not configured');
  const key = buildUploadKey(fieldName, originalName);
  await env.UPLOADS.put(key, data, { httpMetadata: { contentType } });
  return { key, url: `/uploads/${key}` };
}

export async function getUpload(env: Env, key: string): Promise<R2ObjectBody | null> {
  if (!env.UPLOADS) return null;
  return env.UPLOADS.get(key);
}

export function keyFromUploadUrl(url: string): string | null {
  const prefix = '/uploads/';
  if (!url.startsWith(prefix)) return null;
  return url.slice(prefix.length);
}
