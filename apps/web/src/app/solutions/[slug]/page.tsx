import { getSolutionDetail } from "@/components/solution-detail-content";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function Page({ params }: PageProps) {
  const detail = getSolutionDetail((await params).slug);

  if (!detail) notFound();

  return (
    <main>
      <h1>{detail.title}</h1>
    </main>
  );
}
