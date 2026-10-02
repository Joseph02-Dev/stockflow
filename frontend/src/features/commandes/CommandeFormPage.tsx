import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';

interface ElementReference {
  id: string;
  nom: string;
}

interface LigneFormulaire {
  produitId: string;
  quantiteCommandee: number;
}

/** État transmis depuis Alertes lors d'une préparation de commande groupée. */
interface EtatPrerempli {
  fournisseurId?: string;
  lignes?: LigneFormulaire[];
}

export function CommandeFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const prerempli = (location.state as EtatPrerempli | null) ?? null;

  const [fournisseurId, setFournisseurId] = useState(prerempli?.fournisseurId ?? '');
  const [emplacementId, setEmplacementId] = useState('');
  const [lignes, setLignes] = useState<LigneFormulaire[]>(
    prerempli?.lignes && prerempli.lignes.length > 0
      ? prerempli.lignes
      : [{ produitId: '', quantiteCommandee: 1 }],
  );
  const [erreur, setErreur] = useState<string | null>(null);

  const fournisseurs = useQuery({
    queryKey: ['fournisseurs'],
    queryFn: async () => (await api.get<ElementReference[]>('/fournisseurs')).data,
  });
  const emplacements = useQuery({
    queryKey: ['emplacements'],
    queryFn: async () => (await api.get<ElementReference[]>('/emplacements')).data,
  });
  const produits = useQuery({
    queryKey: ['produits', '', false],
    queryFn: async () => (await api.get<ElementReference[]>('/produits')).data,
  });

  const creer = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ id: string }>('/commandes', {
          fournisseurId,
          emplacementId,
          lignes: lignes
            .filter((l) => l.produitId && l.quantiteCommandee > 0)
            .map((l) => ({ produitId: l.produitId, quantiteCommandee: l.quantiteCommandee })),
        })
      ).data,
    onSuccess: (nouvelle) => {
      queryClient.invalidateQueries({ queryKey: ['commandes'] });
      navigate(`/commandes/${nouvelle.id}`);
    },
    onError: (err) => setErreur(messageErreur(err, 'La création a échoué.')),
  });

  function ajouterLigne() {
    setLignes((l) => [...l, { produitId: '', quantiteCommandee: 1 }]);
  }

  function retirerLigne(index: number) {
    setLignes((l) => l.filter((_, i) => i !== index));
  }

  function modifierLigne(index: number, champ: keyof LigneFormulaire, valeur: string | number) {
    setLignes((l) => l.map((ligne, i) => (i === index ? { ...ligne, [champ]: valeur } : ligne)));
  }

  const lignesValides = lignes.filter((l) => l.produitId && l.quantiteCommandee > 0);
  const pretAEnvoyer = !!fournisseurId && !!emplacementId && lignesValides.length > 0;

  // Un même produit ne peut apparaître qu'une fois (contrainte serveur) :
  // on le signale avant l'envoi plutôt que de laisser échouer silencieusement.
  const produitsChoisis = lignes.map((l) => l.produitId).filter(Boolean);
  const doublons = produitsChoisis.length !== new Set(produitsChoisis).size;

  const optionsProduits = [
    { valeur: '', libelle: 'Sélectionner un produit…' },
    ...(produits.data ?? []).map((p) => ({ valeur: p.id, libelle: p.nom })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Nouvelle commande"
        description={
          prerempli?.lignes?.length
            ? 'Pré-remplie à partir de ce qui manque : vérifiez les quantités avant de créer.'
            : 'Un bon de commande par fournisseur, réceptionné dans un emplacement.'
        }
      />

      {erreur && <Alert variant="error">{erreur}</Alert>}
      {doublons && <Alert variant="warning">Un même produit ne peut apparaître qu’une seule fois.</Alert>}

      <Card>
        <div className="flex flex-col gap-4 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="Fournisseur"
              options={[
                { valeur: '', libelle: 'Sélectionner un fournisseur…' },
                ...(fournisseurs.data ?? []).map((f) => ({ valeur: f.id, libelle: f.nom })),
              ]}
              value={fournisseurId}
              onChange={(e) => setFournisseurId(e.target.value)}
            />
            <Select
              label="Emplacement de réception"
              options={[
                { valeur: '', libelle: 'Sélectionner un emplacement…' },
                ...(emplacements.data ?? []).map((e) => ({ valeur: e.id, libelle: e.nom })),
              ]}
              value={emplacementId}
              onChange={(e) => setEmplacementId(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card>
        <PanneauEntete
          titre="Produits à commander"
          meta={`${lignesValides.length} ${lignesValides.length > 1 ? 'lignes prêtes' : 'ligne prête'}`}
        />
        <div className="flex flex-col gap-3 p-5">
          {lignes.map((ligne, index) => (
            <div key={index} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  label={index === 0 ? 'Produit' : ''}
                  aria-label={`Produit, ligne ${index + 1}`}
                  options={optionsProduits}
                  value={ligne.produitId}
                  onChange={(e) => modifierLigne(index, 'produitId', e.target.value)}
                />
              </div>
              <div className="w-24 shrink-0 sm:w-28">
                <Input
                  label={index === 0 ? 'Quantité' : ''}
                  aria-label={`Quantité, ligne ${index + 1}`}
                  type="number"
                  min={1}
                  value={ligne.quantiteCommandee}
                  onChange={(e) => modifierLigne(index, 'quantiteCommandee', Number(e.target.value))}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                icone
                onClick={() => retirerLigne(index)}
                disabled={lignes.length === 1}
                aria-label="Retirer cette ligne"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}

          <div>
            <Button type="button" variant="secondary" onClick={ajouterLigne}>
              <Plus className="size-4" aria-hidden="true" />
              Ajouter une ligne
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate('/commandes')}>
          Annuler
        </Button>
        <Button onClick={() => creer.mutate()} loading={creer.isPending} disabled={!pretAEnvoyer || doublons}>
          Créer la commande
        </Button>
      </div>
    </div>
  );
}
