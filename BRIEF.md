# BRIEF — Weekly Digests (Curation + Business Ideas)

> Document de brief auto-suffisant. N'importe quel agent de coding doit pouvoir démarrer le projet à froid à partir de ce fichier seul.

---

## 1. Résumé en une phrase

Une seule codebase qui scanne les newsletters reçues sur Gmail et produit **deux digests hebdomadaires complémentaires** :
- **Curation Weekly Digest** — lundi 8h — synthèse d'**insights** intellectuels (veille).
- **Business Ideas Weekly** — mercredi 9h — top 5 d'**idées actionnables** (mode founder).

Les deux pipelines partagent l'infra (Gmail MCP, parsing, LLM, livraison email). Seuls les filtres, les prompts d'extraction et le format de sortie diffèrent.

---

## 2. Les deux digests

| | **Curation Weekly Digest** | **Business Ideas Weekly** |
|---|---|---|
| **Cron** | `0 8 * * 1` (lundi 8h) | `0 9 * * 3` (mercredi 9h) |
| **Audience** | Xavier en mode veille / curiosité | Xavier en mode founder / exécution |
| **Sources** | Tier 1 fixe (15 newsletters listées §6) + secondaires | Toute newsletter business/tech crédible (≥ 80 threads max) |
| **Output** | Synthèse insights + tendances + scoring 1-10 | Top 5 idées + tendances + signaux faibles + idées écartées |
| **Critère clé** | Pertinence intellectuelle, profondeur | **Actionnabilité** solo / petite équipe |
| **Action attendue** | Lire / réfléchir / partager | **Lancer / tester / shipper** |
| **Sujet email** | `🧠 Curation Weekly — Semaine du [date]` | `💡 Business Ideas Weekly — Semaine du [date]` |
| **Statut** | Spec complète existante (voir `SKILL.md`) | À implémenter |

Le **SKILL.md** existant à côté de ce BRIEF.md est la spec détaillée du Curation Digest (scoring tiers, sources, règles). Il reste la source de vérité pour ce pipeline. Le présent BRIEF.md le **complète** en cadrant l'architecture commune et la nouvelle pipeline Business Ideas.

---

## 3. Stack & dépendances

- **Langage** : TypeScript (Node ≥ 20)
- **Runtime** : exécution one-shot via scheduled tasks Claude Code (un task par digest)
- **Données entrantes** : Gmail MCP server (`mcp__62ee4d58-...__search_threads` / `__get_thread`)
- **Sortie** :
  1. Fichier `runs/<digest>/YYYY-MM-DD.md` (digest archivé)
  2. Brouillon Gmail créé via `mcp__62ee4d58-...__create_draft` (pas envoyé auto avant validation 2 semaines)
- **LLM** : Claude Sonnet 4.7 via Anthropic SDK (cache prompt activé sur les prompts système)
- **Stockage** : système de fichiers local + Git (le dossier `curation/` est versionné)

Pas de DB. Pas de serveur. Pas d'auth. C'est un script Node lancé par cron Claude Code.

---

## 4. Structure de fichiers cible

```
curation/
├── SKILL.md                       # spec existante du Curation Weekly Digest
├── BRIEF.md                       # ce fichier (architecture + Business Ideas spec)
├── package.json                   # 1 package.json pour les 2 pipelines
├── tsconfig.json
├── src/
│   ├── shared/                    # ← infra commune aux 2 digests
│   │   ├── gmail.ts               # wrapper MCP Gmail (search + fetch threads)
│   │   ├── parse.ts               # html→text, extraction liens, dédup
│   │   ├── llm.ts                 # client Anthropic + cache prompt helpers
│   │   ├── render.ts              # md→html email
│   │   ├── deliver.ts             # write file + create Gmail draft
│   │   └── types.ts
│   ├── curation/                  # ← pipeline lundi
│   │   ├── index.ts               # entrypoint
│   │   ├── score.ts               # scoring tiers (cf SKILL.md)
│   │   ├── sources.ts             # liste Tier 1 fixe
│   │   └── prompts/
│   │       ├── extract-insights.md
│   │       └── synthesize-curation.md
│   └── business-ideas/            # ← pipeline mercredi
│       ├── index.ts               # entrypoint
│       ├── score.ts               # scoring actionnabilité
│       └── prompts/
│           ├── extract-ideas.md
│           └── synthesize-ideas.md
├── runs/
│   ├── curation/
│   │   └── 2026-04-27.md
│   └── business-ideas/
│       └── 2026-04-29.md
└── tests/
    ├── fixtures/                  # threads Gmail capturés (réutilisés par les 2 pipelines)
    ├── shared.test.ts
    ├── curation.test.ts
    └── business-ideas.test.ts
```

**npm scripts** :
- `npm run curation` → lance le pipeline lundi
- `npm run business-ideas` → lance le pipeline mercredi
- `npm run dev:curation` / `dev:business-ideas` → modes dry-run sur fixtures
- `npm test`

---

## 5. Architecture commune (shared/)

Les deux pipelines suivent la même structure 4-phases. Seuls les filtres et prompts changent.

```
┌────────────┐   ┌─────────────┐   ┌──────────────┐   ┌────────────┐
│ 1. Collect │ → │ 2. Extract  │ → │ 3. Synthesize│ → │ 4. Deliver │
│  Gmail MCP │   │  LLM + JSON │   │   LLM + MD   │   │ file+draft │
└────────────┘   └─────────────┘   └──────────────┘   └────────────┘
```

### Phase 1 — Collect (`shared/gmail.ts`)
- Input : query Gmail + max threads
- Pour chaque thread : `{ subject, from, date, body_text, links[] }`
- Garde-fou : 80 threads max (sinon explosion contexte LLM)

### Phase 2 — Extract (`shared/llm.ts` + prompt spécifique)
- Pour chaque thread : appel Claude avec prompt système (cached) + thread (cache user)
- Output JSON forcé via tool use ou `response_format`
- Retourne `[]` si rien d'intéressant — **jamais d'invention**

### Phase 3 — Synthesize (`shared/llm.ts` + prompt spécifique)
- Input : tous les items extraits + scores
- Output : digest markdown final selon gabarit du pipeline

### Phase 4 — Deliver (`shared/deliver.ts`)
1. Écrire `runs/<digest>/YYYY-MM-DD.md`
2. Créer brouillon Gmail (`create_draft`)
3. Logger dans `runs/<digest>/log.jsonl` : timestamp, nb_threads, nb_items, top_score, latency_ms, cost_eur

---

## 6. Pipeline 1 — Curation Weekly Digest (lundi 8h)

**Source de vérité = `SKILL.md`** (voir le fichier voisin). Résumé ici :

- **Query Gmail** : emails 7j depuis les expéditeurs Tier 1 (15 newsletters listées dans SKILL.md §Tier 1)
- **Extraction par newsletter** :
  - 3-5 points clés (faits, chiffres, insights)
  - Liens importants (articles, outils, études)
  - Score pertinence 1-10 selon Tiers (cf SKILL.md)
  - Tags thématiques
- **Synthèse** :
  - Tri par score décroissant
  - Groupement par catégorie thématique (pas par label)
  - Tendances transversales (≥ 3 sources)
- **Cron** : `0 8 * * 1`
- **Sujet email** : `🧠 Curation Weekly — Semaine du [date]`

L'implémentation reprend telle quelle la spec scoring de SKILL.md — ne pas dupliquer ici, lire SKILL.md.

---

## 7. Pipeline 2 — Business Ideas Weekly (mercredi 9h)

### 7.1 Collecte
- **Query** : `newer_than:7d -from:me -in:trash`
- **Filtre** : threads contenant un lien `unsubscribe` OU label `CURATION/*` OU expéditeur business/tech connu
- **Garde-fou** : 80 threads max

### 7.2 Extraction (schema JSON forcé)

```ts
type ExtractedIdea = {
  idea: string                    // 1 phrase claire — "Qu'est-ce qu'on construit ?"
  why_now: string                 // signal/timing — pourquoi cette semaine
  market: string                  // qui paie
  evidence_quote: string          // citation directe ≤ 200 chars
  source: { newsletter: string; url?: string; date: string }
  maturity: 'weak_signal' | 'emerging' | 'established'
  attack_angle: string            // comment un solo founder entre
  estimated_effort: 'weekend' | 'month' | 'quarter' | 'year+'
}
```

Si une newsletter ne contient aucune idée actionnable → `[]`. Pas d'invention.

### 7.3 Scoring d'actionnabilité (1-10)

- **Clarté du marché cible** (0-3)
- **Force du signal "why now"** (0-3)
- **Faisabilité solo/duo** (0-2)
- **Différenciation vs idées génériques connues** (0-2)

### 7.4 Synthèse — output digest
1. **Top 5 idées** (les mieux notées)
2. **3-5 tendances transversales** (sujets mentionnés par ≥ 3 sources)
3. **Signaux faibles à surveiller** (`maturity = weak_signal`, score moyen mais original)
4. **Idées écartées** (1 ligne, pour traçabilité)

### 7.5 Format du digest (gabarit Business Ideas)

```markdown
# 💡 Business Ideas Weekly — Semaine du [date début] au [date fin]

## TL;DR
[2-3 phrases]

---

## 🎯 Top 5 idées actionnables

### 1. [Titre court] — Score X/10
**Quoi :** [1 phrase]
**Pourquoi maintenant :** [signal]
**Marché :** [qui paie]
**Angle solo :** [comment entrer]
**Effort estimé :** [weekend / month / quarter / year+]
**Source :** [newsletter] — [date] — [lien]
> *"[citation]"*

[... × 5]

---

## 📈 Tendances transversales
- **[Tendance 1]** — mentionnée par [N] sources : [résumé]

---

## 🔍 Signaux faibles à surveiller
- ...

---

## 🗑 Idées écartées (traçabilité)
- [Idée] — raison : [trop générique / pas de marché / saturé / ...]

---

## 📊 Stats du run
- Threads scannés : [N]
- Idées extraites : [N]
- Sources uniques : [N]
- Temps total : [XX]s
```

---

## 8. Critères d'acceptation (definition of done)

### Communs aux 2 pipelines
- [ ] `npm run dev:<pipeline>` produit un digest correct depuis fixtures (offline)
- [ ] `npm run <pipeline>` exécute un run réel et écrit `runs/<pipeline>/YYYY-MM-DD.md`
- [ ] Brouillon Gmail créé et visible (pas envoyé)
- [ ] Scheduled task Claude Code créé avec le bon cron
- [ ] Idempotence : relancer le même jour overwrite le fichier + crée/met-à-jour 1 seul draft
- [ ] Aucune invention : 100 % des citations vérifiables dans les threads d'origine
- [ ] README décrit relance manuelle + ajout de source
- [ ] Tests unitaires sur les modules critiques (extract, score, render)

### Spécifiques Curation Weekly Digest
- [ ] Scoring respecte exactement les Tiers de SKILL.md
- [ ] Toutes les newsletters Tier 1 sont incluses si elles ont émis dans la semaine
- [ ] Tendances transversales détectées correctement (test avec fixtures connues)

### Spécifiques Business Ideas Weekly
- [ ] Top 5 strict (pas 4, pas 6) — sauf si < 5 idées totales valides
- [ ] Chaque idée a `evidence_quote` non-vide et trouvable dans le thread
- [ ] Section "idées écartées" présente même si vide

---

## 9. Contraintes & garde-fous (les 2 pipelines)

- **Read-only sur Gmail** sauf création du brouillon final. Aucun label/archive/delete.
- **Coût cible** : < 0,50 € / run avec cache prompt activé.
- **Latence** : < 5 min wall-clock.
- **Pas d'envoi auto** les 2 premières semaines. Xavier review puis on lèvera le garde-fou.
- **Pas d'inventions** : pas de citation source = item rejeté.
- **Pas de fuite de secrets** : `.env` (clé Anthropic) gitignored.

---

## 10. Roadmap post-V1 (hors scope V1)

- **Cross-référence inter-digests** : si une tendance apparaît lundi (Curation) ET mercredi (Business Ideas), badge "🔥 confirmée" sur le 2e digest.
- **Feedback learning** : "j'ai aimé / pas aimé" → ajuste scoring
- **Deep dive Business Ideas** : pour chaque Top 5, recherche web (Exa MCP) pour valider taille marché
- **Dashboard local** (Next.js) pour browser l'historique des `runs/`
- **Auto-send** une fois la qualité validée 2 semaines

---

## 11. Pour démarrer (instructions à l'agent de coding)

**Ordre recommandé** :

1. **Setup** : `cd curation/`, `npm init -y`, `tsconfig.json`, install `@anthropic-ai/sdk`, `dotenv`, `vitest`
2. **`shared/`** d'abord — gmail.ts, parse.ts, llm.ts, render.ts, deliver.ts, types.ts
3. **Fixtures de test** dans `tests/fixtures/` — capturer 5-10 threads réels (sanitized) pour tester offline
4. **Pipeline Business Ideas** (plus simple, neuf) :
   - `business-ideas/index.ts` + prompts + score.ts
   - Dry-run sur fixtures → validation manuelle de la qualité
   - Run réel sur Gmail
5. **Pipeline Curation** (plus complexe, suit SKILL.md à la lettre) :
   - `curation/sources.ts` (liste Tier 1)
   - `curation/score.ts` (scoring multi-tiers de SKILL.md)
   - `curation/index.ts` + prompts
6. **Scheduled tasks Claude Code** :
   - `business-ideas-weekly` cron `0 9 * * 3` → `npm run business-ideas`
   - `curation-weekly-digest` cron `0 8 * * 1` → `npm run curation` (existe déjà côté scheduled tasks, juste pointer dessus)
7. **README.md** : quickstart, comment relancer, comment ajouter une source
8. **Premier run réel** → review brouillon par Xavier

**Question bloquante = STOP.** Pose-la dans le chat plutôt qu'inventer une réponse.
