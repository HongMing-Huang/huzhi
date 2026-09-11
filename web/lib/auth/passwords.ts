// 密码哈希：scrypt + 随机盐 + timingSafeEqual 校验。绝不存明文。
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LEN = 64;

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, KEY_LEN);
  return `s1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [v, saltHex, hashHex] = stored.split("$");
  if (v !== "s1" || !saltHex || !hashHex) return false;
  const hash = scryptSync(pw, Buffer.from(saltHex, "hex"), KEY_LEN);
  const expected = Buffer.from(hashHex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}
