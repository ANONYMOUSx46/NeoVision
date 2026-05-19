import { create } from 'zustand';

export interface Admin {
  id: string;
  email: string;
}

interface AuthState {
  token: string | null;
  admin: Admin | null;
  isAuthenticated: boolean;
  login: (token: string, admin: Admin) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('neovision_token'),
  admin: (() => {
    try {
      const stored = localStorage.getItem('neovision_admin');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })(),
  isAuthenticated: !!localStorage.getItem('neovision_token'),

  login: (token: string, admin: Admin) => {
    localStorage.setItem('neovision_token', token);
    localStorage.setItem('neovision_admin', JSON.stringify(admin));
    set({ token, admin, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('neovision_token');
    localStorage.removeItem('neovision_admin');
    set({ token: null, admin: null, isAuthenticated: false });
  },
}));