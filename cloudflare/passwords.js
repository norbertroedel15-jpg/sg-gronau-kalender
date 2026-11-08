const encoder = new TextEncoder()
const hex = bytes => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('')
export const randomToken = (bytes = 32) => hex(crypto.getRandomValues(new Uint8Array(bytes)))
export async function digest(value) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))
}
export async function equalSecret(a, b) {
  // Constant-size comparison after hashing; also used for the setup token.
  const left = await digest(a), right = await digest(b)
  let difference = 0
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return difference === 0
}
async function derive(password, salt, pepper) {
  const pepperKey = await crypto.subtle.importKey('raw', encoder.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const input = await crypto.subtle.sign('HMAC', pepperKey, encoder.encode(password))
  const key = await crypto.subtle.importKey('raw', input, 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 100000, salt: encoder.encode(salt) }, key, 256)
  return hex(new Uint8Array(bits))
}
export async function passwordHash(password, pepper) {
  const salt = randomToken(16)
  return `pbkdf2-sha256$100000$${salt}$${await derive(password, salt, pepper)}`
}
export async function passwordMatches(password, stored, pepper) {
  const valid = /^pbkdf2-sha256\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(stored || '')
  const parts = valid ? stored.split('$') : ['','', '0'.repeat(32), '0'.repeat(64)]
  const candidate = await derive(password, parts[2], pepper)
  return (await equalSecret(candidate, parts[3])) && valid
}
