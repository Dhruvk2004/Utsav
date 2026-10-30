import type { Metadata } from "next";
import { EventSettings } from "@/components/workspace/EventSettings";

export const metadata: Metadata = { title: "Settings · Event" };

export default function EventSettingsPage() {
  return <EventSettings />;
}
