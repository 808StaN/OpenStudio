import { createClient } from "@supabase/supabase-js";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

export const SUPABASE_UNCONFIGURED_MESSAGE =
  "Cloud login is unavailable because Supabase is not configured.";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export function assertSupabaseConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error(SUPABASE_UNCONFIGURED_MESSAGE);
  }
}

function createUnavailableSupabaseClient() {
  const rejectUnavailable = async function () {
    throw new Error(SUPABASE_UNCONFIGURED_MESSAGE);
  };

  const throwUnavailable = function () {
    throw new Error(SUPABASE_UNCONFIGURED_MESSAGE);
  };

  return {
    auth: {
      getUser: rejectUnavailable,
      signInWithPassword: rejectUnavailable,
      signUp: rejectUnavailable,
      signOut: rejectUnavailable,
      onAuthStateChange: function () {
        return {
          data: {
            subscription: {
              unsubscribe: function () {},
            },
          },
        };
      },
    },
    from: throwUnavailable,
    storage: {
      from: throwUnavailable,
    },
  };
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : createUnavailableSupabaseClient();
