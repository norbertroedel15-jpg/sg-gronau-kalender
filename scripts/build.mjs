import { rmSync, readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

// Only generated build output/configuration is removed. Keep D1 state and secrets.
rmSync(resolve('dist'),{recursive:true,force:true})
rmSync(resolve('.wrangler/deploy'),{recursive:true,force:true})
const built=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{stdio:'inherit'})
if (built.status!==0) process.exit(built.status || 1)
const html=readFileSync('dist/index.html','utf8')
const entry=html.match(/<script[^>]*src="(\/assets\/[^\"]+\.js)"/)
if (!entry || !existsSync(`dist${entry[1]}`)) throw new Error('Das gebaute Frontend enthält kein gültiges Einstiegsskript.')
const script=readFileSync(`dist${entry[1]}`,'utf8')
if (!script.includes('Kontaktbuch')) throw new Error('Das gebaute Frontend enthält das Kontaktbuch nicht. Veröffentlichung abgebrochen.')
console.log(`Geprüftes Frontend mit Kontaktbuch: ${entry[1]}`)
