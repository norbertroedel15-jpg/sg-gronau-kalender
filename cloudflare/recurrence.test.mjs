import { test } from 'node:test'
import assert from 'node:assert/strict'
import { weeklyDates } from '../shared/recurrence.js'
test('Wöchentliche Termine: mehrere Tage, Schaltjahr, Sommerzeit und Eingabegrenzen',()=>{
  assert.deepEqual(weeklyDates('2026-11-09','2026-11-20',[2,4]),['2026-11-10','2026-11-12','2026-11-17','2026-11-19'])
  assert.deepEqual(weeklyDates('2026-11-09','2026-11-20',[3]),['2026-11-11','2026-11-18'])
  assert.deepEqual(weeklyDates('2028-02-27','2028-03-01',[2]),['2028-02-29'])
  assert.deepEqual(weeklyDates('2026-03-22','2026-04-05',[7]),['2026-03-22','2026-03-29','2026-04-05'])
  assert.equal(weeklyDates('2028-01-01','2028-12-31',[1,2,3,4,5,6,7]).length,366)
  for(const [a,b,days] of [['2026-02-30','2026-03-02',[1]],['2026-11-10','2026-11-09',[2]],['2026-11-09','2028-01-01',[2]],['2026-11-09','2026-11-20',[]],['2026-11-09','2026-11-20',[0]],['2026-11-09','2026-11-20',[2,2]],['2026-11-09','2026-11-09',[2]]])assert.throws(()=>weeklyDates(a,b,days))
})
