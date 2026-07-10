import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import type { Metadata } from "next";

type PortalPageProps = {
  params: Promise<{ slug: string[] }>;
};

function pathnameFromSegments(segments: string[]) {
  return `/${segments.join("/")}`;
}

export async function generateMetadata({
  params,
}: PortalPageProps): Promise<Metadata> {
  const { slug } = await params;
  return metadataForRegisteredRoute(pathnameFromSegments(slug));
}

export default async function PortalPage({ params }: PortalPageProps) {
  const { slug } = await params;
  return <RegisteredRoutePage pathname={pathnameFromSegments(slug)} />;
}
