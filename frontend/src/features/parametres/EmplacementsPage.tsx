import { EmplacementsSection } from './EmplacementsSection';
import { RangementSection } from './RangementSection';
import { useModules } from '@/lib/useModules';

/** Dépôts, boutiques et réserves où le stock est rangé. */
export function EmplacementsPage() {
  const modules = useModules();
  return (
    <div className="flex flex-col gap-5">
      <EmplacementsSection />
      {modules.rangement && <RangementSection />}
    </div>
  );
}
