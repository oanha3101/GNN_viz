/**
 * Auth Store — JWT-based authentication state.
 * Stores access_token in localStorage for persistence across page reloads.
 */
import { create } from 'zustand';
import { apiJson, AUTH_TOKEN_KEY } from '../utils/api';

const TOKEN_KEY = AUTH_TOKEN_KEY;
const USER_KEY = 'gnn_user';

const useAuthStore = create((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY) || null,
  user: JSON.parse(localStorage.getItem(USER_KEY) || 'null'),
  isAuthenticated: !!localStorage.getItem(TOKEN_KEY),
  loading: false,
  error: null,

  /**
   * Register a new account.
   */
  register: async (email, username, password, fullName) => {
    set({ loading: true, error: null });
    try {
      const data = await apiJson('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, username, password, full_name: fullName }),
      });
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      set({
        token: data.access_token,
        user: data.user,
        isAuthenticated: true,
        loading: false,
      });
      return data;
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  /**
   * Login with username/password.
   */
  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const data = await apiJson('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      set({
        token: data.access_token,
        user: data.user,
        isAuthenticated: true,
        loading: false,
      });
      return data;
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  /**
   * Logout — clear token and user.
   */
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ token: null, user: null, isAuthenticated: false, error: null });
  },

  /**
   * Get auth headers for API requests.
   */
  getAuthHeaders: () => {
    const token = get().token;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  },

  /**
   * Verify current token is still valid.
   */
  verifyToken: async () => {
    const token = get().token;
    if (!token) return false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const user = await apiJson('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      set({ user, isAuthenticated: true });
      return true;
    } catch {
      get().logout();
      return false;
    } finally {
      clearTimeout(timeout);
    }
  },

  updateProfile: async (profile) => {
    const token = get().token;
    if (!token) throw new Error('Not authenticated');
    set({ loading: true, error: null });
    try {
      const data = await apiJson('/auth/me', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(profile),
      });
      localStorage.setItem(USER_KEY, JSON.stringify(data));
      set({ user: data, loading: false, isAuthenticated: true });
      return data;
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },
}));

export default useAuthStore;
