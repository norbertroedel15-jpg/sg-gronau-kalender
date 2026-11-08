import { readFileSync } from 'node:fs'
const config = JSON.parse(readFileSync('wrangler.jsonc','utf8'))
const id = config.d1_databases?.find(d => d.binding === 'DB')?.database_id
if (typeof id !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) || /^0{8}(-0{4}){3}-0{12}$/.test(id)) {
  console.error('Noch keine Cloudflare-Datenbank verbunden. Zuerst die eigene database_id in wrangler.jsonc eintragen. Siehe CLOUDFLARE.md.')
  process.exit(1)
}
