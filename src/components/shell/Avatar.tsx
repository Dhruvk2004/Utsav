import Image from "next/image";

/** Up to two initials from a display name: "Ananya Kulkarni" -> "AK". */
export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase());
  return letters.join("") || "?";
}

/** The user's Google photo, or their initials on the brand tint. Decorative: the name is always written nearby. */
export function Avatar({ name, photoURL, size = 36 }: { name: string; photoURL: string | null; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-tint font-bold text-brand"
      style={{ width: size, height: size, fontSize: size * 0.39 }}
      aria-hidden="true"
    >
      {photoURL ? <Image src={photoURL} alt="" width={size} height={size} /> : initials(name)}
    </span>
  );
}
