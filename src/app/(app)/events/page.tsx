import { redirect } from "next/navigation";

/** `/events` has no page of its own; My events lives at /dashboard (spec 3.1). */
export default function EventsIndex() {
  redirect("/dashboard");
}
