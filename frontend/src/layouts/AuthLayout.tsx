import type { ReactNode } from 'react';
import { Boxes } from 'lucide-react';

export function AuthLayout({
  titre,
  sousTitre,
  children,
  pied,
}: {
  titre: string;
  sousTitre?: string;
  children: ReactNode;
  pied?: ReactNode;
}) {
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Boxes className="size-7 text-primary" aria-hidden="true" />
          <span className="text-xl font-semibold text-secondary">StockFlow</span>
        </div>

        <div className="rounded-(--radius-card) border border-border-subtle bg-surface p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-text-primary">{titre}</h1>
          {sousTitre && <p className="mt-1 text-sm text-text-secondary">{sousTitre}</p>}
          <div className="mt-6">{children}</div>
        </div>

        {pied && <div className="mt-4 text-center text-sm text-text-secondary">{pied}</div>}
      </div>
    </main>
  );
}
