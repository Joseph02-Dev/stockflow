/**
 * Grammaire des tableaux denses : en-tête #FAFBFC en 11.5 px / 500,
 * lignes séparées par des filets, première et dernière colonnes alignées
 * sur le padding des panneaux (20 px).
 */
export const tableau = {
  table: 'w-full text-corps',
  thead: 'border-b border-rule bg-entete-tableau text-left text-meta text-steel-500',
  th: 'px-3 py-2.5 font-medium first:pl-5 last:pr-5',
  tbody: 'divide-y divide-rule',
  tr: 'hover:bg-entete-tableau',
  td: 'px-3 py-3 first:pl-5 last:pr-5',
};
