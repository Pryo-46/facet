/**
 * ID 採番（rev 5章の ID 規約）。<entityPrefix>_<62文字アルファベットの10文字>。
 * Skill 側の scripts/new-id.mjs と同じ規約——アプリと AI が並行して要素を
 * 追加するため、連番は必ず衝突する。
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const LENGTH = 10
/** 256 を 62 で割り切れる最大の倍数。これ以上の値を捨てて剰余の偏りを消す */
const LIMIT = 248

export type RandomBytes = (count: number) => Uint8Array

const cryptoRandomBytes: RandomBytes = (count) => crypto.getRandomValues(new Uint8Array(count))

export function newId(prefix: string, randomBytes: RandomBytes = cryptoRandomBytes): string {
  let body = ''
  while (body.length < LENGTH) {
    for (const b of randomBytes(LENGTH)) {
      if (b >= LIMIT) continue
      body += ALPHABET[b % ALPHABET.length]
      if (body.length === LENGTH) break
    }
  }
  return `${prefix}_${body}`
}
