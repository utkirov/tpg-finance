import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/** Пароли хранятся только как scrypt-хэш с индивидуальной солью. */

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex')
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') }
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const stored = Buffer.from(hash, 'hex')
  const given = scryptSync(password, salt, 64)
  return stored.length === given.length && timingSafeEqual(stored, given)
}

export function newToken(): string {
  return randomBytes(32).toString('hex')
}
