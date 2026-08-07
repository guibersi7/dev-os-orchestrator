"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { AuthSession } from "@/lib/auth-session";

type AuthContextValue = {
  session: AuthSession;
  isAuthenticated: boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialSession,
}: {
  children: ReactNode;
  initialSession: AuthSession;
}) {
  const [session, setSession] = useState<AuthSession>(initialSession);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: session.status === "authenticated",
      logout: () => setSession({ status: "unauthenticated", user: null }),
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
