import type { Metadata, Viewport } from "next";
import { Fraunces, Noto_Sans_Devanagari, Plus_Jakarta_Sans } from "next/font/google";
import { SkipLink } from "@/components/shell/SkipLink";
import { AnnouncerProvider } from "@/components/ui/Announcer";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

// Font budget (design-system 3): Jakarta (variable) and Fraunces 600 are preloaded Latin files;
// Devanagari is never preloaded and downloads only when `lang="hi"` text is on screen.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], weight: "600", variable: "--font-fraunces", display: "swap" });
const notoDeva = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-noto-deva", display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "Utsav · Plan the celebration, not the chaos", template: "%s · Utsav" },
  description:
    "Plan weddings, birthdays and community events with a budget that always adds up, a timeline from your big day back, a vendor checklist and ideas made for your people.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4b1d5c" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1219" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} ${fraunces.variable} ${notoDeva.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <SkipLink />
        <AnnouncerProvider>
          <ToastProvider>{children}</ToastProvider>
        </AnnouncerProvider>
      </body>
    </html>
  );
}
