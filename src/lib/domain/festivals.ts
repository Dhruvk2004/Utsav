import { daysBetween } from "./dates";

export const FESTIVALS = [
  "diwali",
  "holi",
  "navratri",
  "durga_puja",
  "ganesh_chaturthi",
  "eid_al_fitr",
  "eid_al_adha",
  "christmas",
  "onam",
  "pongal",
  "raksha_bandhan",
  "independence_day",
  "republic_day",
] as const;
export type Festival = (typeof FESTIVALS)[number];

export const FESTIVAL_LABELS: Record<Festival, string> = {
  diwali: "Diwali",
  holi: "Holi",
  navratri: "Navratri",
  durga_puja: "Durga Puja",
  ganesh_chaturthi: "Ganesh Chaturthi",
  eid_al_fitr: "Eid al-Fitr",
  eid_al_adha: "Eid al-Adha",
  christmas: "Christmas",
  onam: "Onam",
  pongal: "Pongal / Sankranti",
  raksha_bandhan: "Raksha Bandhan",
  independence_day: "Independence Day",
  republic_day: "Republic Day",
};

/**
 * Main festival day per year in India (Navratri: first day; Durga Puja: Maha Saptami).
 * Lunar dates follow the published national holiday calendars and can shift by a day
 * with local sightings; years outside the table are never guessed.
 */
export const FESTIVAL_DATES: Record<Festival, readonly string[]> = {
  diwali: ["2026-11-08", "2027-10-29", "2028-10-17"],
  holi: ["2026-03-04", "2027-03-22", "2028-03-11"],
  navratri: ["2026-10-11", "2027-09-30", "2028-09-19"],
  durga_puja: ["2026-10-18", "2027-10-07", "2028-09-25"],
  ganesh_chaturthi: ["2026-09-14", "2027-09-04", "2028-08-23"],
  eid_al_fitr: ["2026-03-20", "2027-03-10", "2028-02-27"],
  eid_al_adha: ["2026-05-27", "2027-05-17", "2028-05-05"],
  christmas: ["2026-12-25", "2027-12-25", "2028-12-25"],
  onam: ["2026-08-26", "2027-09-12", "2028-08-31"],
  pongal: ["2026-01-14", "2027-01-15", "2028-01-15"],
  raksha_bandhan: ["2026-08-28", "2027-08-17", "2028-08-05"],
  independence_day: ["2026-08-15", "2027-08-15", "2028-08-15"],
  republic_day: ["2026-01-26", "2027-01-26", "2028-01-26"],
};

export const FESTIVAL_WINDOW_DAYS = 10;

export type FestivalProximity = { festival: Festival; date: string; daysAway: number };

/**
 * The festival closest to `date` within `windowDays` either side, or null. `daysAway` is
 * positive when the festival comes after the date. Ties go to the festival that comes first.
 */
export function nearestFestival(date: string, windowDays = FESTIVAL_WINDOW_DAYS): FestivalProximity | null {
  let best: FestivalProximity | null = null;
  for (const festival of FESTIVALS) {
    for (const day of FESTIVAL_DATES[festival]) {
      const daysAway = daysBetween(date, day);
      if (Math.abs(daysAway) > windowDays) continue;
      const closer = !best || Math.abs(daysAway) < Math.abs(best.daysAway);
      const tieEarlier = best !== null && Math.abs(daysAway) === Math.abs(best.daysAway) && day < best.date;
      if (closer || tieEarlier) best = { festival, date: day, daysAway };
    }
  }
  return best;
}

/** Dates of one festival on or after `from`, ascending. */
export function upcomingDates(festival: Festival, from: string): string[] {
  return FESTIVAL_DATES[festival].filter((day) => day >= from);
}
