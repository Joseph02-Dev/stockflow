-- Régularisation des comptes créés avant l'introduction du double opt-in
-- (migration précédente) : sans ce correctif, tout utilisateur déjà
-- inscrit se retrouverait bloqué à sa prochaine connexion, alors qu'il
-- utilise déjà l'application normalement depuis parfois des semaines.
-- On utilise sa date de création comme date de vérification de repli —
-- il n'a jamais eu à confirmer son email, mais son compte a déjà fait
-- ses preuves autrement (connexions réussies antérieures).
UPDATE "utilisateur" SET "email_verifie_at" = "created_at" WHERE "email_verifie_at" IS NULL;
