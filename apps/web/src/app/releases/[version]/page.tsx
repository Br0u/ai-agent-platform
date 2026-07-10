import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";

type PageProps = {
  params: Promise<{ version: string }>;
};

function pathnameFor(version: string) {
  return `/releases/${version}`;
}

export async function generateMetadata({ params }: PageProps) {
  const { version } = await params;
  return metadataForRegisteredRoute(pathnameFor(version));
}

export default async function Page({ params }: PageProps) {
  const { version } = await params;
  return <RegisteredRoutePage pathname={pathnameFor(version)} />;
}
