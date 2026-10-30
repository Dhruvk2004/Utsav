import { SiteFooter } from "@/components/shell/SiteFooter";

/** Public pages: each draws its own header (the landing one sits on the brand band). */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {children}
      <SiteFooter />
    </>
  );
}
