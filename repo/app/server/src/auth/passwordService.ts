import bcrypt from 'bcrypt';
import { getConfig } from '../config';

/**
 * Thin bcrypt wrapper. Always uses the configured cost factor
 * (`MS_BCRYPT_ROUNDS`, default 12). Plaintext passwords never leave the
 * arguments of these functions.
 */
export async function hashPassword(plain: string): Promise<string> {
  const rounds = getConfig().auth.bcryptRounds;
  return bcrypt.hash(plain, rounds);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export function bcryptCostOf(hash: string): number | null {
  // bcrypt hashes are of the form `$2b$<cost>$...`
  const match = /^\$2[aby]?\$(\d{2})\$/.exec(hash);
  return match ? Number(match[1]) : null;
}
