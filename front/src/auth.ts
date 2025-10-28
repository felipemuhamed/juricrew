export const tokenKey = "jwt";
export function saveToken(t: string) { localStorage.setItem(tokenKey, t); }
export function getToken(): string | null { return localStorage.getItem(tokenKey); }
export function clearToken() { localStorage.removeItem(tokenKey); }
