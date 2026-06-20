import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db.js';

const SECRET = process.env.FALAFELS_JWT_SECRET || 'falafels-dev-secret-change-me';
// Long-lived so an installed home-screen app effectively stays logged in. The
// token is also re-issued on every /me call (sliding expiry), so an active
// customer never gets signed out.
const TOKEN_TTL = '365d';

export function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

export function checkPassword(pw, hash) {
  return bcrypt.compareSync(pw, hash);
}

export function issueToken(user) {
  return jwt.sign({ uid: user.id }, SECRET, { expiresIn: TOKEN_TTL });
}

// Express middleware — verifies the Bearer token and attaches req.user.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const { uid } = jwt.verify(token, SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
    if (!user) return res.status(401).json({ error: 'Account not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please sign in again' });
  }
}
