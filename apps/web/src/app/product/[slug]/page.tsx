import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function pathnameFor(slug: string) {
  return `/product/${slug}`;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  return metadataForRegisteredRoute(pathnameFor(slug));
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  return <RegisteredRoutePage pathname={pathnameFor(slug)} />;
}
