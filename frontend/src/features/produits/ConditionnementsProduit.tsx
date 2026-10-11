import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Plus } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { formatNombre } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Selecteur } from '@/components/ui/Selecteur';
import { Card, PanneauEntete } from '@/components/patterns/Page';

export interface Conditionnement {
  id: string;
  nom: string;
  facteur: number;
}

/**
 * Conditionnements d'un produit (module « conditionnements ») : la
 * contenance se saisit en unités ou en un autre conditionnement
 * (« Palette = 20 × Carton »), toujours enregistrée en unités de base.
 */
export function ConditionnementsProduit({ produitId, unite }: { produitId: string; unite: string | null }) {
  const queryClient = useQueryClient();
  const uniteBase = unite || 'unité';
  const [nom, setNom] = useState('');
  const [nombre, setNombre] = useState('');
  const [contenant, setContenant] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const cle = ['conditionnements', produitId];
  const { data = [] } = useQuery({
    queryKey: cle,
    queryFn: async () => (await api.get<Conditionnement[]>(`/produits/${produitId}/conditionnements`)).data,
  });

  const base = data.find((c) => c.id === contenant);
  const facteur = Number(nombre) * (base?.facteur ?? 1);
  const valide = nom.trim() !== '' && Number.isInteger(Number(nombre)) && Number(nombre) >= 1 && facteur >= 2;

  const creer = useMutation({
    mutationFn: async () => api.post(`/produits/${produitId}/conditionnements`, { nom: nom.trim(), facteur }),
    onSuccess: () => {
      setNom('');
      setNombre('');
      setContenant('');
      setErreur(null);
      queryClient.invalidateQueries({ queryKey: cle });
    },
    onError: (e) => setErreur(messageErreur(e, 'L’ajout a échoué.')),
  });

  const archiver = useMutation({
    mutationFn: async (id: string) => api.patch(`/conditionnements/${id}/archive`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cle }),
    onError: (e) => setErreur(messageErreur(e, 'L’archivage a échoué.')),
  });

  return (
    <Card>
      <PanneauEntete titre="Conditionnements" meta={`Le stock reste compté en ${uniteBase}s`} />
      {data.length > 0 && (
        <ul className="divide-y divide-rule border-b border-rule">
          {data.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <span className="text-corps text-ink-900">
                <span className="font-medium">1 {c.nom}</span>
                <span className="text-steel-500">
                  {' '}
                  = {formatNombre(c.facteur)} {uniteBase}s
                </span>
              </span>
              <Button variant="ghost" taille="sm" loading={archiver.isPending} onClick={() => archiver.mutate(c.id)}>
                <Archive className="size-4" aria-hidden="true" />
                <span className="sr-only">Archiver {c.nom}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-3 p-5">
        {erreur && <Alert variant="error">{erreur}</Alert>}
        {/* Colonne étroite de la fiche produit : le nom sur toute la largeur. */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Input label="Nom" placeholder="Carton, Palette…" value={nom} onChange={(e) => setNom(e.target.value)} />
          </div>
          <Input
            label="Contient"
            type="number"
            min={1}
            inputMode="numeric"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <Selecteur
            label="De"
            value={contenant}
            onChange={setContenant}
            options={[
              { valeur: '', libelle: `${uniteBase}s` },
              ...data.map((c) => ({ valeur: c.id, libelle: `${c.nom} (${formatNombre(c.facteur)})` })),
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-meta text-steel-500">
            {valide ? `1 ${nom.trim()} = ${formatNombre(facteur)} ${uniteBase}s` : 'Au moins 2 unités par conditionnement.'}
          </p>
          <Button taille="sm" disabled={!valide} loading={creer.isPending} onClick={() => creer.mutate()}>
            <Plus className="size-4" aria-hidden="true" />
            Ajouter
          </Button>
        </div>
      </div>
    </Card>
  );
}
