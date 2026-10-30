import type { BudgetStyle, Dietary, IdeaCategory, Occasion, ProfileRole, ReviewSection, Tradition, VendorStatus } from "./model/enums";
import { DETAIL_LEVELS, GENDERS, HONOREE_ROLES } from "./model/enums";
import type { EventType, Language } from "./schemas";

/**
 * English labels for the closed vocabularies. Code-built titles (dashboard cards, the share page
 * heading) and every form use these, so a value is always shown the same way.
 */

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  wedding: "Wedding",
  birthday: "Birthday",
  anniversary: "Anniversary",
  community: "Community",
  other: "Other",
};

export const OCCASION_LABELS: Record<Occasion, string> = {
  diwali: "Diwali",
  ganesh_chaturthi: "Ganesh Chaturthi",
  holi: "Holi",
  navratri: "Navratri",
  eid: "Eid",
  christmas: "Christmas",
  independence_day: "Independence Day",
  republic_day: "Republic Day",
  housewarming: "Housewarming",
  naming_ceremony: "Naming ceremony",
  other: "Other",
};

export const TRADITION_LABELS: Record<Tradition, string> = {
  north_indian: "North Indian",
  punjabi: "Punjabi",
  gujarati: "Gujarati",
  marathi: "Marathi",
  bengali: "Bengali",
  tamil: "Tamil",
  telugu: "Telugu",
  kannada: "Kannada",
  malayali: "Malayali",
  rajasthani: "Rajasthani",
  marwari: "Marwari",
  sindhi: "Sindhi",
  christian: "Christian",
  muslim: "Muslim",
  parsi: "Parsi",
  sikh: "Sikh",
  jain: "Jain",
  mixed_other: "Mixed/other",
  undisclosed: "Prefer not to say",
};

export const DIETARY_LABELS: Record<Dietary, string> = {
  veg: "Vegetarian",
  jain: "Jain",
  nonveg_ok: "Non-veg ok",
  vegan: "Vegan",
  no_onion_garlic: "No onion-garlic",
  egg_free: "Egg-free",
  nut_allergy: "Nut allergies",
};

export const ROLE_LABELS: Record<ProfileRole, string> = {
  self_family: "My own or family celebration",
  parent: "My child's celebration",
  community: "Community or society events",
  professional: "I plan events for others",
};

export const BUDGET_STYLE_LABELS: Record<BudgetStyle, string> = {
  simple: "Keep it simple",
  balanced: "Balanced",
  all_out: "Go all out",
};

export const DETAIL_LEVEL_LABELS: Record<(typeof DETAIL_LEVELS)[number], string> = {
  everything: "Everything",
  urgent: "Only what is urgent",
};

export const LANGUAGE_LABELS: Record<Language, string> = { en: "English", hi: "Hindi" };

export const HONOREE_ROLE_LABELS: Record<(typeof HONOREE_ROLES)[number], string> = {
  bride: "Bride",
  groom: "Groom",
  birthday_child: "Birthday child",
  couple: "Couple",
  guest_of_honour: "Guest of honour",
  community: "Community",
};

/** UI labels for the optional gender field (spec 5.1); unset is offered as "Not set". */
export const GENDER_LABELS: Record<(typeof GENDERS)[number], string> = {
  female: "Female",
  male: "Male",
  nonbinary: "Non-binary",
  undisclosed: "Prefer not to say",
};

/** Festival occasions read as "Diwali celebration"; the rest are named as they are. */
const PLAIN_OCCASIONS: readonly Occasion[] = ["housewarming", "naming_ceremony"];

/** English ordinal: 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 60th. */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

export interface TitleParts {
  eventType: EventType;
  occasion: Occasion | null;
  occasionOther: string;
  milestone: number | null;
}

/**
 * A title built in code from type, occasion and milestone ("6th birthday", "Diwali celebration").
 * It is the wizard's title placeholder and the heading wherever the owner's own title is hidden.
 */
export function defaultEventTitle({ eventType, occasion, occasionOther, milestone }: TitleParts): string {
  if (eventType === "birthday") return milestone ? `${ordinal(milestone)} birthday` : "Birthday";
  if (eventType === "anniversary") return milestone ? `${ordinal(milestone)} anniversary` : "Anniversary";
  if (eventType === "wedding") return "Wedding";
  if (occasion === "other" && occasionOther.trim()) return occasionOther.trim();
  if (occasion && occasion !== "other") {
    const label = OCCASION_LABELS[occasion];
    return PLAIN_OCCASIONS.includes(occasion) ? label : `${label} celebration`;
  }
  return eventType === "community" ? "Community event" : "Celebration";
}

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  to_research: "To research",
  contacted: "Contacted",
  quoted: "Quoted",
  booked: "Booked",
  paid: "Paid",
  not_needed: "Not needed",
};

export const IDEA_CATEGORY_LABELS: Record<IdeaCategory, string> = {
  decor: "Decor",
  food: "Food",
  activity: "Activity",
  entertainment: "Entertainment",
  ritual: "Ritual",
  favours: "Favours",
  photo: "Photo",
  experience: "Experience",
};

export const REVIEW_SECTION_LABELS: Record<ReviewSection, string> = {
  budget: "Budget",
  timeline: "Timeline",
  vendors: "Vendors",
  ideas: "Ideas",
};
