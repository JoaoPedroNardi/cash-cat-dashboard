import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Valida um access token de sessão (obtido no cliente via
 * `supabase.auth.getSession()`) e devolve um client Supabase já autenticado
 * como esse usuário (respeitando RLS) mais o userId. Usado por server
 * functions que recebem o token explicitamente no payload, em vez de
 * depender de repasse de header entre cliente e servidor.
 */
export async function authenticateWithToken(accessToken: string) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ['SUPABASE_PUBLISHABLE_KEY'] : []),
    ];
    throw new Error(`Missing Supabase environment variable(s): ${missing.join(', ')}.`);
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getClaims(accessToken);
  if (error || !data?.claims?.sub) {
    throw new Error('Sessão inválida ou expirada');
  }

  return { supabase, userId: data.claims.sub as string, claims: data.claims };
}
