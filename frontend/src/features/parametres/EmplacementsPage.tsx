import { PageHeader } from '@/components/patterns/Page';
import { EmplacementsSection } from './EmplacementsSection';

/** Dépôts, boutiques et réserves où le stock est rangé. */
export function EmplacementsPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader titre="Emplacements" description="Vos dépôts, boutiques et réserves : là où le stock est rangé." />
      <EmplacementsSection />
    </div>
  );
}
