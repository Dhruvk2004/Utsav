/** Forty major Indian cities offered as suggestions for home city and event city; free text is always allowed (spec 4.2). */
export const INDIAN_CITIES: readonly { name: string; state: string }[] = [
  { name: "Mumbai", state: "Maharashtra" },
  { name: "Delhi", state: "Delhi" },
  { name: "Bengaluru", state: "Karnataka" },
  { name: "Hyderabad", state: "Telangana" },
  { name: "Ahmedabad", state: "Gujarat" },
  { name: "Chennai", state: "Tamil Nadu" },
  { name: "Kolkata", state: "West Bengal" },
  { name: "Pune", state: "Maharashtra" },
  { name: "Jaipur", state: "Rajasthan" },
  { name: "Surat", state: "Gujarat" },
  { name: "Lucknow", state: "Uttar Pradesh" },
  { name: "Kanpur", state: "Uttar Pradesh" },
  { name: "Nagpur", state: "Maharashtra" },
  { name: "Indore", state: "Madhya Pradesh" },
  { name: "Bhopal", state: "Madhya Pradesh" },
  { name: "Visakhapatnam", state: "Andhra Pradesh" },
  { name: "Patna", state: "Bihar" },
  { name: "Vadodara", state: "Gujarat" },
  { name: "Ludhiana", state: "Punjab" },
  { name: "Agra", state: "Uttar Pradesh" },
  { name: "Nashik", state: "Maharashtra" },
  { name: "Varanasi", state: "Uttar Pradesh" },
  { name: "Amritsar", state: "Punjab" },
  { name: "Chandigarh", state: "Chandigarh" },
  { name: "Coimbatore", state: "Tamil Nadu" },
  { name: "Madurai", state: "Tamil Nadu" },
  { name: "Kochi", state: "Kerala" },
  { name: "Thiruvananthapuram", state: "Kerala" },
  { name: "Mysuru", state: "Karnataka" },
  { name: "Mangaluru", state: "Karnataka" },
  { name: "Goa", state: "Goa" },
  { name: "Guwahati", state: "Assam" },
  { name: "Bhubaneswar", state: "Odisha" },
  { name: "Ranchi", state: "Jharkhand" },
  { name: "Raipur", state: "Chhattisgarh" },
  { name: "Dehradun", state: "Uttarakhand" },
  { name: "Udaipur", state: "Rajasthan" },
  { name: "Noida", state: "Uttar Pradesh" },
  { name: "Gurugram", state: "Haryana" },
  { name: "Puducherry", state: "Puducherry" },
];

/** Cities whose name starts with the query first, then those containing it; at most `limit`. */
export function suggestCities(query: string, limit = 6): { name: string; state: string }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = INDIAN_CITIES.filter((c) => c.name.toLowerCase().startsWith(q));
  const contains = INDIAN_CITIES.filter((c) => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}
