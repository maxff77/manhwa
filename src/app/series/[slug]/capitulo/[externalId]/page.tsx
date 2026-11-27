import type { Metadata } from "next";
import { Reader } from "@/components/reader";

// Shell cliente prerenderizado (v1.md): la ruta no depende de datos del
// servidor para arrancar, así el service worker podrá servirla offline (#32).
export const dynamic = "force-static";

type Params = { params: Promise<{ slug: string; externalId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { externalId } = await params;
  return { title: `Capítulo ${externalId}` };
}

export default async function ChapterPage({ params }: Params) {
  const { slug, externalId } = await params;
  return <Reader slug={slug} externalId={externalId} />;
}
