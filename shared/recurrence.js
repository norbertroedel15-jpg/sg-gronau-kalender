export const DAY_MS = 86400000
export function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value ? time : NaN
}
export function addDays(date, days) {
  const time = dateValue(date)
  return Number.isFinite(time) ? new Date(time+days*DAY_MS).toISOString().slice(0,10) : ''
}
export function weeklyDates(start, end, weekdays) {
  const from = dateValue(start), until = dateValue(end)
  if (!Number.isFinite(from) || !Number.isFinite(until) || until < from) throw new Error('Bitte ein gültiges Start- und Enddatum wählen.')
  if (until-from > 365*DAY_MS) throw new Error('Eine Serie darf höchstens ein Jahr umfassen.')
  if (!Array.isArray(weekdays) || !weekdays.length || weekdays.length > 7 || !weekdays.every(n=>Number.isInteger(n)&&n>=1&&n<=7) || new Set(weekdays).size !== weekdays.length) throw new Error('Bitte mindestens einen Wochentag auswählen.')
  const dates=[]
  for (let day=from;day<=until;day+=DAY_MS) {
    const date=new Date(day),weekday=((date.getUTCDay()+6)%7)+1
    if (weekdays.includes(weekday)) dates.push(date.toISOString().slice(0,10))
  }
  if (!dates.length) throw new Error('Im gewählten Zeitraum liegt keiner der ausgewählten Wochentage.')
  return dates
}
