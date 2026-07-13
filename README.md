# Compte rendu — Service Habitat

Outil de compte rendu de réunion structuré par pôle (Cadre de Vie / Offre et Demande / LTS),
avec report automatique des actions non terminées, dépôt de sujets par les agents, export PDF
et connexion optionnelle à Supabase pour un usage partagé en équipe.

## Lancer en local

Prérequis : Node.js 18+ installé.

```bash
npm install
npm run dev
```

Ouvre ensuite l'URL affichée (en général http://localhost:5173).

Par défaut, l'outil fonctionne **en mode local** : toutes les données (comptes rendus,
compteurs de référence, sujets proposés) sont stockées dans le `localStorage` de ton
navigateur, propres à cet ordinateur. Rien n'est partagé tant que Supabase n'est pas connecté.

## Connecter Supabase (mode équipe partagé)

1. Va dans l'onglet **Paramètres** de l'application.
2. Copie le script SQL affiché et exécute-le une fois dans l'éditeur SQL de ton projet
   Supabase (`lypeksjzahbrbjhnvmsy` ou un autre projet dédié).
3. Renseigne l'URL du projet et la clé API **legacy** (`anon`, commence par `eyJ…` — les
   nouvelles clés `sb_publishable_` ne fonctionnent pas en appel REST direct).
4. Clique sur « Se connecter ». Une fois connecté, tous les utilisateurs de cette même
   application (déployée en ligne) liront et écriront dans les mêmes données.

⚠️ Le script SQL fourni ouvre la table en lecture/écriture libre (cohérent avec le reste de
l'écosystème zéro-infra). À restreindre avec une policy RLS plus stricte si besoin avant un
usage en production avec des données sensibles.

## Build de production

```bash
npm run build
```

Le résultat est généré dans `dist/`.

## Déployer sur Vercel

1. Pousse ce dossier sur un dépôt GitHub.
2. Sur [vercel.com](https://vercel.com), importe le dépôt.
3. **Important** : dans les paramètres du projet Vercel, mets le *Framework Preset* sur
   **"Other"** (pas "Vite" ni "Create React App") — sans quoi le build peut échouer.
4. Build command : `npm run build` — Output directory : `dist`.
5. Déploie. L'URL fournie peut ensuite être reliée à ton portail
   (`habitat-portail.vercel.app`) comme les autres outils de l'écosystème.

## Structure du projet

```
src/
  App.jsx        → toute l'application (vues, formulaires, stockage, styles)
  main.jsx       → point d'entrée React
  index.css      → Tailwind
index.html
tailwind.config.js
vite.config.js
```

## Notes techniques

- Stockage : `localStorage` en mode local, appels REST directs à Supabase (`/rest/v1/…`) en
  mode partagé — pas de dépendance au SDK `supabase-js`.
- Une seule table Supabase (`service_habitat_cr`) stocke tout en `jsonb` : les comptes rendus,
  les compteurs de référence (`__counters__`) et les sujets proposés (`__proposals__`).
- Aucune authentification pour l'instant : le nom de l'agent est saisi librement. À prévoir
  si l'outil devient l'outil de référence du service.
