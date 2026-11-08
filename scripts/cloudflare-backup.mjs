import { mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const dir = 'backups'
mkdirSync(dir,{recursive:true,mode:0o700})
const stamp = new Date().toISOString().replaceAll(':','-').replaceAll('.','-')
const output = `${dir}/calendar-${stamp}.sql`
const result = spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','export','DB','--remote','--output',output],{stdio:'inherit'})
if (result.status !== 0) process.exit(result.status || 1)
console.log(`Sicherung gespeichert: ${output}. Enthält private Vereinsdaten; geschützt außerhalb von GitHub aufbewahren.`)
