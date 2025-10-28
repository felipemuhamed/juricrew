import axios from "axios";

export const tokenKey = "jwt"; // reuse same key everywhere

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:9999",
  withCredentials: true, // still allow cookie, but we won't depend on it
  headers: { "Content-Type": "application/json" },
});

/** Set / clear the Authorization header + localStorage */
export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem(tokenKey, token);
    http.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    localStorage.removeItem(tokenKey);
    delete http.defaults.headers.common["Authorization"];
  }
}

// Boot: load token (if any) so refreshes keep you logged in
const bootToken = localStorage.getItem(tokenKey);
if (bootToken) {
  http.defaults.headers.common["Authorization"] = `Bearer ${bootToken}`;
}

// Optional: centralized error logging
http.interceptors.response.use(
  (r) => r,
  (err) => {
    console.error("API error:", err?.response?.status, err?.response?.data);
    return Promise.reject(err);
  }
);
