export type Role = 'EMPLOYEE' | 'HR_ADMIN';
export type Profile = { id: number; role: Role; displayName: string; email: string };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch('/api' + path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = response.status === 413 ? 'Ukuran foto maksimal 2 MiB.' : body?.message;
    throw new ApiError(response.status, typeof message === 'string' ? message : 'Permintaan gagal. Coba lagi.');
  }
  return response.status === 204 ? undefined as T : response.json();
}

export function json(method: string, body: object): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : 'Koneksi terputus. Periksa jaringan dan coba lagi.';
}
