import type { Language } from '@isgratis/types';

/** Subjects people often wonder about, to fill a new language quickly. Drafts are reviewed by hand. */
export const STARTER_TOPICS: Record<Language, string[]> = {
  nl: [
    'lucht', 'water', 'zonlicht', 'kraanwater', 'openbaar vervoer', 'bibliotheek', 'museum', 'onderwijs',
    'huisarts', 'ambulance', 'parkeren', 'wifi', 'openbaar toilet', 'snelweg', 'veerpont', 'stemmen',
    'paspoort', 'rijbewijs', 'vaccinatie', 'tandarts', 'kinderopvang', 'strand', 'nationaal park', 'tolweg',
  ],
  en: [
    'air', 'water', 'sunlight', 'tap water', 'public transport', 'library', 'museum', 'education',
    'doctor', 'ambulance', 'parking', 'wifi', 'public toilet', 'motorway', 'ferry', 'voting',
    'passport', 'driving licence', 'vaccination', 'dentist', 'childcare', 'beach', 'national park', 'toll road',
  ],
  de: [
    'Luft', 'Wasser', 'Sonnenlicht', 'Leitungswasser', 'öffentlicher Nahverkehr', 'Bibliothek', 'Museum',
    'Studium', 'Hausarzt', 'Rettungswagen', 'Parken', 'WLAN', 'öffentliche Toilette', 'Autobahn', 'Fähre',
    'Reisepass', 'Impfung', 'Zahnarzt', 'Kita', 'Strand', 'Nationalpark',
  ],
  es: [
    'aire', 'agua', 'luz del sol', 'agua del grifo', 'transporte público', 'biblioteca', 'museo', 'universidad',
    'médico', 'ambulancia', 'aparcamiento', 'wifi', 'baño público', 'autopista', 'ferry', 'pasaporte',
    'vacunación', 'dentista', 'guardería', 'playa', 'parque nacional',
  ],
};
