/**
 * @module domain/contracts/files/contract-object-storage-driver
 * @description Driver abstrato de object storage — Phase 10.10.
 */

export interface ObjectStorageUploadResult {
  path: string;
  sizeBytes: number;
}

export interface ObjectStorageSignedUrl {
  url: string;
  expiresAt: string;
}

export interface ContractObjectStorageDriver {
  upload(
    path: string,
    bytes: Uint8Array,
    options: { mimeType: string; upsert?: boolean },
  ): Promise<ObjectStorageUploadResult>;

  download(path: string): Promise<Uint8Array>;

  remove(path: string): Promise<void>;

  createSignedUrl(path: string, expiresInSeconds: number): Promise<ObjectStorageSignedUrl>;

  exists(path: string): Promise<boolean>;
}

export function createMemoryObjectStorageDriver(
  store: Map<string, { bytes: Uint8Array; mimeType: string }> = new Map(),
): ContractObjectStorageDriver & { readonly store: Map<string, { bytes: Uint8Array; mimeType: string }> } {
  return {
    store,
    async upload(path, bytes, options) {
      store.set(path, { bytes: new Uint8Array(bytes), mimeType: options.mimeType });
      return { path, sizeBytes: bytes.byteLength };
    },
    async download(path) {
      const found = store.get(path);
      if (!found) {
        throw Object.assign(new Error('Objeto não encontrado.'), {
          code: 'CONTRACT_STORAGE_OBJECT_NOT_FOUND',
        });
      }
      return new Uint8Array(found.bytes);
    },
    async remove(path) {
      store.delete(path);
    },
    async createSignedUrl(path, expiresInSeconds) {
      if (!store.has(path)) {
        throw Object.assign(new Error('Objeto não encontrado.'), {
          code: 'CONTRACT_STORAGE_OBJECT_NOT_FOUND',
        });
      }
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
      return { url: `memory://${path}?exp=${encodeURIComponent(expiresAt)}`, expiresAt };
    },
    async exists(path) {
      return store.has(path);
    },
  };
}

type SupabaseStorageBucket = {
  upload: (
    path: string,
    body: Uint8Array | ArrayBuffer,
    options?: { contentType?: string; upsert?: boolean },
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  download: (path: string) => Promise<{ data: Blob | null; error: { message?: string } | null }>;
  remove: (paths: string[]) => Promise<{ data: unknown; error: { message?: string } | null }>;
  createSignedUrl: (
    path: string,
    expiresIn: number,
  ) => Promise<{ data: { signedUrl: string } | null; error: { message?: string } | null }>;
  list: (
    path?: string,
    options?: { limit?: number; search?: string },
  ) => Promise<{ data: Array<{ name: string }> | null; error: { message?: string } | null }>;
};

export type SupabaseStorageClient = {
  storage: { from: (bucket: string) => SupabaseStorageBucket };
};

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

export function createSupabaseObjectStorageDriver(
  client: SupabaseStorageClient,
  bucket: string,
): ContractObjectStorageDriver {
  const bucketClient = client.storage.from(bucket);

  return {
    async upload(path, bytes, options) {
      const { data, error } = await bucketClient.upload(path, bytes, {
        contentType: options.mimeType,
        upsert: options.upsert ?? false,
      });
      if (error) {
        throw Object.assign(new Error(error.message || 'Upload falhou.'), {
          code: 'CONTRACT_FILE_STORAGE_UNAVAILABLE',
        });
      }
      void data;
      return { path, sizeBytes: bytes.byteLength };
    },

    async download(path) {
      const { data, error } = await bucketClient.download(path);
      if (error || !data) {
        throw Object.assign(new Error(error?.message || 'Download falhou.'), {
          code: 'CONTRACT_STORAGE_OBJECT_NOT_FOUND',
        });
      }
      return blobToUint8Array(data);
    },

    async remove(path) {
      const { error } = await bucketClient.remove([path]);
      if (error) {
        throw Object.assign(new Error(error.message || 'Remove falhou.'), {
          code: 'CONTRACT_FILE_STORAGE_UNAVAILABLE',
        });
      }
    },

    async createSignedUrl(path, expiresInSeconds) {
      const { data, error } = await bucketClient.createSignedUrl(path, expiresInSeconds);
      if (error || !data?.signedUrl) {
        throw Object.assign(new Error(error?.message || 'Signed URL indisponível.'), {
          code: 'CONTRACT_STORAGE_POLICY_DENIED',
        });
      }
      return {
        url: data.signedUrl,
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      };
    },

    async exists(path) {
      const parts = path.split('/');
      const fileName = parts.pop() || '';
      const prefix = parts.join('/');
      const { data, error } = await bucketClient.list(prefix || undefined, {
        limit: 1,
        search: fileName,
      });
      if (error) return false;
      return Boolean(data?.some((item) => item.name === fileName));
    },
  };
}
