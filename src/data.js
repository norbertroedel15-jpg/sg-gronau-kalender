/** Beispieldaten für die visuelle Vorschau (November 2026). */

export const SAMPLE_EVENTS = [
  {
    id: '1',
    title: 'Training D-Jugend',
    date: '2026-11-03',
    time: '17:00',
    endTime: '18:30',
    place: 'Kunstrasenplatz',
    type: 'training',
    createdBy: 'Trainer Müller',
  },
  {
    id: '2',
    title: 'Spiel C-Jugend vs. SV Nord',
    date: '2026-11-08',
    time: '10:30',
    endTime: '12:00',
    place: 'Sportanlage Hauptplatz',
    type: 'spiel',
    createdBy: 'Sportlicher Leiter',
  },
  {
    id: '3',
    title: 'Training B-Jugend',
    date: '2026-11-10',
    time: '18:00',
    endTime: '19:30',
    place: 'Kunstrasenplatz',
    type: 'training',
    createdBy: 'Trainer Schneider',
  },
  {
    id: '4',
    title: 'Sitzung Jugendausschuss',
    date: '2026-11-12',
    time: '19:00',
    endTime: '20:30',
    place: 'Vereinsheim',
    type: 'sitzung',
    createdBy: 'Abteilungsvorstand',
  },
  {
    id: '5',
    title: 'Training E-Jugend',
    date: '2026-11-14',
    time: '16:00',
    endTime: '17:15',
    place: 'Nebenplatz',
    type: 'training',
    createdBy: 'Betreuerin Klein',
  },
  {
    id: '6',
    title: 'Spiel A-Jugend Heim',
    date: '2026-11-15',
    time: '14:00',
    endTime: '15:45',
    place: 'Sportanlage Hauptplatz',
    type: 'spiel',
    createdBy: 'Trainer Weber',
  },
  {
    id: '7',
    title: 'Training AH',
    date: '2026-11-18',
    time: '20:00',
    endTime: '21:30',
    place: 'Kunstrasenplatz',
    type: 'training',
    createdBy: 'Leitung AH',
  },
  {
    id: '8',
    title: 'Torwarttraining',
    date: '2026-11-19',
    time: '17:30',
    endTime: '18:30',
    place: 'Halle',
    type: 'training',
    createdBy: 'Trainer Müller',
  },
  {
    id: '9',
    title: 'Spiel D-Jugend Auswärts',
    date: '2026-11-22',
    time: '11:00',
    endTime: '12:30',
    place: 'FC West – Gast',
    type: 'spiel',
    createdBy: 'Betreuerin Klein',
  },
  {
    id: '10',
    title: 'Trainerbesprechung',
    date: '2026-11-25',
    time: '19:30',
    endTime: '21:00',
    place: 'Vereinsheim',
    type: 'sitzung',
    createdBy: 'Abteilungsvorstand',
  },
  {
    id: '11',
    title: 'Training C-Jugend',
    date: '2026-11-26',
    time: '17:00',
    endTime: '18:30',
    place: 'Kunstrasenplatz',
    type: 'training',
    createdBy: 'Trainer Schneider',
  },
  {
    id: '12',
    title: 'Elternabend U13',
    date: '2026-11-27',
    time: '18:30',
    endTime: '20:00',
    place: 'Vereinsheim',
    type: 'sitzung',
    createdBy: 'Jugendbetreuer',
  },
]

export const TYPE_LABELS = {
  training: 'Training',
  spiel: 'Spiel',
  sitzung: 'Sitzung',
}

export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export const MONTH_NAMES = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
]

export const DEFAULT_EVENT_TYPES = [
  { id:'training', name:'Training', color:'#156649', enabled:1 },
  { id:'spiel', name:'Spiel', color:'#b42318', enabled:1 },
  { id:'sitzung', name:'Sitzung', color:'#1a5f7a', enabled:1 },
]

export function typeStyle(type) {
  const color = /^#[a-f0-9]{6}$/i.test(type?.color || '') ? type.color : '#156649'
  const values = [1,3,5].map(i => parseInt(color.slice(i,i+2),16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4)
  const luminance = .2126*values[0] + .7152*values[1] + .0722*values[2]
  return { background:color, color:luminance > .179 ? '#0e241b' : '#ffffff' }
}
