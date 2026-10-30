/** Closed vocabularies shared by stored documents, operations and the UI (spec section 8.2). */

export const OCCASIONS = [
  "diwali",
  "ganesh_chaturthi",
  "holi",
  "navratri",
  "eid",
  "christmas",
  "independence_day",
  "republic_day",
  "housewarming",
  "naming_ceremony",
  "other",
] as const;
export type Occasion = (typeof OCCASIONS)[number];

export const DIETARY = ["veg", "jain", "nonveg_ok", "vegan", "no_onion_garlic", "egg_free", "nut_allergy"] as const;
export type Dietary = (typeof DIETARY)[number];

export const TRADITIONS = [
  "north_indian",
  "punjabi",
  "gujarati",
  "marathi",
  "bengali",
  "tamil",
  "telugu",
  "kannada",
  "malayali",
  "rajasthani",
  "marwari",
  "sindhi",
  "christian",
  "muslim",
  "parsi",
  "sikh",
  "jain",
  "mixed_other",
  "undisclosed",
] as const;
export type Tradition = (typeof TRADITIONS)[number];

export const PROFILE_ROLES = ["self_family", "parent", "community", "professional"] as const;
export type ProfileRole = (typeof PROFILE_ROLES)[number];

export const BUDGET_STYLES = ["simple", "balanced", "all_out"] as const;
export type BudgetStyle = (typeof BUDGET_STYLES)[number];

export const DETAIL_LEVELS = ["everything", "urgent"] as const;

export const VENDOR_STATUSES = ["to_research", "contacted", "quoted", "booked", "paid", "not_needed"] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export const IDEA_CATEGORIES = ["decor", "food", "activity", "entertainment", "ritual", "favours", "photo", "experience"] as const;
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];

export const COST_BASES = ["per event", "per guest", "per kid"] as const;
export const EFFORTS = ["diy", "vendor", "mixed"] as const;
export const IDEA_STATES = ["suggested", "saved"] as const;
export const IDEA_SOURCES = ["ai", "library", "user"] as const;
export type IdeaSource = (typeof IDEA_SOURCES)[number];

/** Who wrote an item: the model, the user, or Utsav's own code (templates, code proposals). */
export const ORIGINS = ["ai", "user", "code"] as const;
export type Origin = (typeof ORIGINS)[number];

export const HONOREE_ROLES = ["bride", "groom", "birthday_child", "couple", "guest_of_honour", "community"] as const;
export const GENDERS = ["female", "male", "nonbinary", "undisclosed"] as const;

export const REVIEW_SECTIONS = ["budget", "timeline", "vendors", "ideas"] as const;
export type ReviewSection = (typeof REVIEW_SECTIONS)[number];
export const REVIEW_STATES = ["pending", "reviewed", "reset"] as const;

export const EVENT_STATUSES = ["active", "archived"] as const;
export const PLAN_SOURCES = ["ai", "template", "blank"] as const;
export const DRAFT_CHANNELS = ["whatsapp", "email"] as const;
export type DraftChannel = (typeof DRAFT_CHANNELS)[number];
export const DRAFT_ORIGINS = ["ai", "template", "user"] as const;
export type DraftOrigin = (typeof DRAFT_ORIGINS)[number];
