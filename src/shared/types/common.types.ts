export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };
