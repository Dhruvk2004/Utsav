import { ServicesProvider } from "@/components/data/ServicesProvider";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SiteHeader } from "@/components/shell/SiteHeader";

/** Sign-in and onboarding: logo-only header, no navigation away from the task. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <ServicesProvider>
      <SiteHeader minimal />
      {children}
      <SiteFooter />
    </ServicesProvider>
  );
}
