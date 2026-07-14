import {
  metadataForRegisteredRoute,
  RegisteredRoutePage,
} from "@/components/route-scaffold/registered-route-page";
import { coreModules } from "@/components/product-content";
import { ModuleDetailPage } from "@/components/module-detail";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function pathnameFor(slug: string) {
  return `/product/${slug}`;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const moduleData = coreModules.find((m) => m.href === pathnameFor(slug));
  if (moduleData) {
    return {
      title: `${moduleData.name} - ${moduleData.title} | AI Agent Platform`,
      description: moduleData.description,
    };
  }
  return metadataForRegisteredRoute(pathnameFor(slug));
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const pathname = pathnameFor(slug);
  const moduleData = coreModules.find((m) => m.href === pathname);

  if (moduleData) {
    // 强制类型推断：由于我们在 coreModules 中添加了扩展字段，因此这里的类型应为包含新字段的对象
    return (
      <ModuleDetailPage
        moduleData={
          moduleData as React.ComponentProps<
            typeof ModuleDetailPage
          >["moduleData"]
        }
      />
    );
  }

  return <RegisteredRoutePage pathname={pathname} />;
}
