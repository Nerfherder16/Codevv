import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { api } from '../lib/api';
import type { User, TokenResponse, Organization } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  userOrgs: Organization[];
  currentOrg: Organization | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string, inviteToken?: string) => Promise<void>;
  logout: () => void;
  updateProfile: (data: { display_name?: string; avatar_url?: string; onboarding_completed?: boolean }) => Promise<void>;
  setCurrentOrg: (org: Organization | null) => void;
  fetchUserOrgs: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userOrgs, setUserOrgs] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);

  const fetchUserOrgs = useCallback(async () => {
    try {
      const orgs = await api.orgs.list();
      setUserOrgs(orgs);
      // Auto-select first org (personal workspace) if none selected
      if (!currentOrg && orgs.length > 0) {
        setCurrentOrg(orgs[0]);
      }
    } catch {
      setUserOrgs([]);
    }
  }, [currentOrg]);

  const fetchUser = useCallback(async () => {
    try {
      const u = await api.get<User>('/auth/me');
      setUser(u);
      // Load orgs after user is confirmed
      try {
        const orgs = await api.orgs.list();
        setUserOrgs(orgs);
        if (orgs.length > 0) {
          setCurrentOrg((prev) => prev ?? orgs[0]);
        }
      } catch {
        // Orgs load failure doesn't block auth
      }
    } catch {
      setUser(null);
      setUserOrgs([]);
      setCurrentOrg(null);
      localStorage.removeItem('bh-token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (email: string, password: string) => {
    const res = await api.post<TokenResponse>('/auth/login', { email, password });
    localStorage.setItem('bh-token', res.access_token);
    await fetchUser();
  };

  const register = async (email: string, password: string, displayName: string, inviteToken?: string) => {
    const res = await api.post<TokenResponse>('/auth/register', {
      email,
      password,
      display_name: displayName,
      ...(inviteToken ? { invite_token: inviteToken } : {}),
    });
    localStorage.setItem('bh-token', res.access_token);
    await fetchUser();
  };

  const updateProfile = useCallback(
    async (data: { display_name?: string; avatar_url?: string; onboarding_completed?: boolean }) => {
      const updated = await api.patch<User>('/auth/me', data);
      setUser(updated);
    },
    [],
  );

  const logout = () => {
    localStorage.removeItem('bh-token');
    setUser(null);
    setUserOrgs([]);
    setCurrentOrg(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, userOrgs, currentOrg, login, register, logout, updateProfile, setCurrentOrg, fetchUserOrgs }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
