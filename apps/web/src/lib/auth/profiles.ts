import type { User } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/auth/server";
import { isSupabaseAdminConfigured } from "@/lib/auth/config";

export type SignupProfile = {
  email: string;
  phone: string;
  fullName: string;
  birthDate: string;
  profession: string;
  company: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

export function validateSignupLike(value: Partial<SignupProfile>): SignupProfile | null {
  const profile = {
    email: normalizeEmail(value.email),
    phone: clean(value.phone),
    fullName: clean(value.fullName),
    birthDate: clean(value.birthDate),
    profession: clean(value.profession),
    company: clean(value.company),
  };

  if (!profile.email || !profile.phone || !profile.fullName || !profile.birthDate || !profile.profession || !profile.company) {
    return null;
  }

  return profile;
}

export async function getUserProfileByEmail(email: string) {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("Supabase admin access is not configured.");
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("id,email")
    .eq("email", normalizeEmail(email))
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function getAuthUserByEmail(email: string): Promise<User | null> {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("Supabase admin access is not configured.");
  }

  const normalizedEmail = normalizeEmail(email);
  const supabase = createAdminSupabaseClient();

  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });

    if (error) {
      throw error;
    }

    const user = data.users.find((candidate) => normalizeEmail(candidate.email) === normalizedEmail);
    if (user) {
      return user;
    }

    if (!data.nextPage) {
      return null;
    }
  }

  return null;
}

export async function ensureUserProfile(user: User, fallbackProfile?: SignupProfile | null) {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("Supabase admin access is not configured.");
  }

  const email = normalizeEmail(user.email);
  const metadata = user.user_metadata ?? {};
  const profile =
    fallbackProfile ??
    validateSignupLike({
      email,
      phone: metadata.phone,
      fullName: metadata.full_name ?? metadata.name,
      birthDate: metadata.birth_date,
      profession: metadata.profession,
      company: metadata.company,
    });

  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from("users").upsert(
    {
      id: user.id,
      email,
      name: profile?.fullName || clean(metadata.name) || clean(metadata.full_name) || email,
      avatar_url: clean(metadata.avatar_url) || null,
      phone: profile?.phone || null,
      birth_date: profile?.birthDate || null,
      profession: profile?.profession || null,
      company: profile?.company || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    throw error;
  }
}
