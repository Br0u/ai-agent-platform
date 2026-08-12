import type { Metadata } from "next";
import { PartnerCenter } from "@/components/partner-center";
import { partnerViewContent } from "@/components/partner-center-content";
import "./partners.css";

export const metadata: Metadata = {
  title: "合作伙伴 · 华鲲元启",
  description: partnerViewContent.overview.lead,
};

export default function PartnersPage() {
  return <PartnerCenter />;
}
