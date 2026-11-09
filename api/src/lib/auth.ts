import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { db } from '../db';
import { ApiError } from './http';
import { newId, now } from './ids';

export interface UserRow {
  id: string; email: string; password_hash: string; name: string; role: 'candidate' | 'employer' | 'admin'; company_id: string | null;
  status: 'active' | 'suspended'; failed_logins: number; locked_until: string | null; created_at: string;
}

declare global {
  namespace Express {
    interface Request { user: UserRow; viewer: UserRow | null; sessionId: string }
  }
}

const unauthorized = () => new ApiError(401, 'UNAUTHORIZED', 'Please sign in again');
export const getUser = (id: string) => db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;

export function startSession(userId: string, device: string) {
  const id = newId();
  const expires = new Date(Date.now() + config.sessionDays * 86_400_000).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, device, created_at, expires_at) VALUES (?,?,?,?,?)').run(id, userId, device.slice(0, 80), now(), expires);
  return jwt.sign({ sid: id }, config.jwtSecret, { subject: userId, expiresIn: `${config.sessionDays}d`, algorithm: 'HS256' });
}

function resolve(req: Request): { user: UserRow; sessionId: string } | null {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) return null;
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(header.slice(7), config.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
  } catch {
    return null;
  }
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(payload.sid, payload.sub) as { id: string; revoked_at: string | null; expires_at: string } | undefined;
  if (!session || session.revoked_at || session.expires_at <= now()) return null;
  const user = getUser(payload.sub!);
  if (!user || user.status !== 'active') return null;
  return { user, sessionId: session.id };
}

export function optionalUser(req: Request, _res: Response, next: NextFunction) {
  req.viewer = resolve(req)?.user ?? null;
  next();
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  const found = resolve(req);
  if (!found) return next(unauthorized());
  req.user = found.user;
  req.sessionId = found.sessionId;
  next();
}

export const requireRole = (...roles: UserRow['role'][]) => (req: Request, _res: Response, next: NextFunction) => {
  next(roles.includes(req.user.role) ? undefined : new ApiError(403, 'FORBIDDEN', 'Your account cannot do this'));
};

export const hashPassword = (value: string) => bcrypt.hash(value, config.isTest ? 4 : 10);
const DUMMY = bcrypt.hashSync('not-a-real-password', 4);
export const burnCompare = (value: string) => bcrypt.compare(value, DUMMY);

export async function checkPassword(user: UserRow, password: string) {
  const locked = (db.prepare('SELECT locked_until FROM users WHERE id = ?').pluck().get(user.id) as string | null);
  if (locked && locked > now()) throw new ApiError(423, 'LOCKED', 'Too many failed attempts. Please try again later.');
  if (await bcrypt.compare(password, user.password_hash)) {
    db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(user.id);
    return;
  }
  const failed = db.prepare('UPDATE users SET failed_logins = failed_logins + 1 WHERE id = ? RETURNING failed_logins').pluck().get(user.id) as number;
  if (failed >= config.maxLoginAttempts) {
    db.prepare('UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?').run(new Date(Date.now() + config.lockMinutes * 60_000).toISOString(), user.id);
    throw new ApiError(423, 'LOCKED', 'Too many failed attempts. Please try again later.');
  }
  throw new ApiError(401, 'BAD_CREDENTIALS', 'Wrong email or password');
}
