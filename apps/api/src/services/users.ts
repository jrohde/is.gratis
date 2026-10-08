import { and, eq, gt, lt } from 'drizzle-orm';
import type { User } from '@isgratis/types';
import type { Database } from '../db/client.js';
import { sessions, users, type UserRow } from '../db/schema.js';
import { conflict, HttpError } from '../lib/errors.js';
import { newToken, sha256 } from '../lib/hash.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

export function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, displayName: row.displayName, role: row.role };
}

export async function registerUser(
  db: Database,
  input: { email: string; password: string; displayName: string },
  adminEmails: string[],
): Promise<User> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  const [row] = await db
    .insert(users)
    .values({
      email,
      displayName: input.displayName.trim(),
      passwordHash,
      role: adminEmails.includes(email) ? 'admin' : 'user',
    })
    .onConflictDoNothing()
    .returning();
  if (!row) throw conflict('email_taken', 'An account with this email already exists');
  return toUser(row);
}

export async function authenticate(db: Database, email: string, password: string): Promise<User> {
  const [row] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  // Hash anyway when the user does not exist, so timing does not reveal which emails are registered.
  const ok = row
    ? await verifyPassword(password, row.passwordHash)
    : (await hashPassword(password), false);
  if (!row || !ok) throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect');
  return toUser(row);
}

export async function createSession(db: Database, userId: string, ttlDays: number) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt });
  // Opportunistic cleanup keeps the table small without a cron job.
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
  return { token, expiresAt };
}

export async function userForSession(db: Database, token: string): Promise<User | null> {
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ? toUser(row.user) : null;
}

export async function deleteSession(db: Database, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}
