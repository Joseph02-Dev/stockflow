/**
 * Imprime la seule facture : une copie est posée directement sous <body>
 * (hors des conteneurs de l'application, qui décaleraient la mise en page)
 * le temps de la boîte d'impression, puis retirée.
 */
export function imprimerFacture(facture: HTMLElement) {
  const copie = document.createElement('div');
  copie.id = 'copie-impression';
  copie.appendChild(facture.cloneNode(true));
  document.body.appendChild(copie);
  document.body.classList.add('impression-facture');
  const nettoyer = () => {
    copie.remove();
    document.body.classList.remove('impression-facture');
    window.removeEventListener('afterprint', nettoyer);
  };
  window.addEventListener('afterprint', nettoyer);
  window.print();
}
