export interface Admin {
  id: string;
  email: string;
}

export interface Client {
  id: string;
  device_id: string;
  hostname: string;
  os_version: string;
  agent_version: string;
  is_online: boolean;
  last_seen_at: string;
  registered_at: string;
}

export interface Session {
  id: string;
  admin_id: string;
  client_id: string;
  started_at: string;
  ended_at: string | null;
  duration_secs: number | null;
}

export interface AuthState {
  token: string | null;
  admin: Admin | null;
  isAuthenticated: boolean;
  login: (token: string, admin: Admin) => void;
  logout: () => void;
}