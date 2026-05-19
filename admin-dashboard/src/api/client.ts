import axios from 'axios';

const RELAY_URL = 'https://neovision-relay.onrender.com';

const api = axios.create({
  baseURL: RELAY_URL,
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('neovision_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('neovision_token');
      localStorage.removeItem('neovision_admin');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    return res.data;
  },

  verifyTotp: async (tempToken: string, totpCode: string) => {
    const res = await api.post('/auth/totp/verify', { tempToken, totpCode });
    return res.data;
  },

  me: async () => {
    const res = await api.get('/auth/me');
    return res.data;
  },
};

export const clientsApi = {
  getAll: async () => {
    const res = await api.get('/clients');
    return res.data.clients;
  },

  getById: async (id: string) => {
    const res = await api.get(`/clients/${id}`);
    return res.data;
  },

  getSessions: async (id: string, page = 1) => {
    const res = await api.get(`/clients/${id}/sessions?page=${page}`);
    return res.data;
  },
};

export default api;