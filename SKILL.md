# Curation Weekly Digest

## Description
Skill qui ingère toutes les newsletters de la semaine dans les labels CURATION/*, les digère, synthétise et extrait les insights les plus pertinents pour Xavier. Livré par email chaque lundi matin.

## Trigger
- Cron : Lundi 8h00 (Europe/Paris)
- Manuel : `/curation-digest` ou "donne-moi mon digest de la semaine"

## Workflow

### Phase 1 — Collecte (Gmail MCP)
1. Rechercher tous les emails reçus dans les 7 derniers jours pour chaque expéditeur du système CURATION
2. Lire le contenu complet de chaque email/thread
3. Extraire : titre, corps, liens, date, expéditeur

### Phase 2 — Analyse & Scoring
Pour chaque newsletter :
1. Extraire les **3-5 points clés** (faits, chiffres, insights)
2. Identifier les **liens importants** (articles, outils, études)
3. Attribuer un **score de pertinence** (1-10) basé sur les priorités ci-dessous
4. Tagger avec les thèmes détectés

### Phase 3 — Synthèse
1. Classer par score décroissant
2. Grouper par catégorie thématique (pas par label Gmail, mais par sujet réel)
3. Identifier les **tendances transversales** (sujets mentionnés par 3+ sources)
4. Rédiger le digest final

### Phase 4 — Livraison
1. Créer un brouillon Gmail avec le digest formaté
2. L'envoyer à xvironneau@gmail.com
3. Sujet : `🧠 Curation Weekly — Semaine du [date] au [date]`

---

## Système de Scoring

### Tier 1 — Sources prioritaires (score de base : 8/10)
Ces sources sont toujours lues en détail, même si le sujet n'est pas directement IA :

| Source | Email | Pourquoi prioritaire |
|--------|-------|---------------------|
| **Estelle Métayer** (Competia / Weak Signals) | competia@substack.com | Vision stratégique, veille concurrentielle. TOUJOURS inclure, tous sujets |
| **Daniel Eckler** | hi@danieleckler.com | Futurisme, design, société. Contenu visionnaire |
| **The Sociology of Business** (Ana Andjelic) | andjelicaaa@substack.com | Sociologie du business, culture, comportement consommateur |
| **Marie Dolle** | mariedolle@substack.com | Tech, société, tendances françaises |
| **Every** | hello@every.to | Essais profonds sur AI, productivité, business |
| **The Hustle** | news@thehustle.co | Business news, startups, trends |
| **The Senses by Future Commerce** | hello@futurecommerce.com | Prospective, signaux faibles, retail futur |
| **Benedict Evans** | list@ben-evans.com | Analyse tech macro, mobile, plateformes |
| **The Trend Report** (TrendHunter) | trendcandy@trendhunter.com | Tendances consommateur, innovation |
| **Not Boring** (Packy McCormick) | notboring@substack.com | Stratégie, startups, tech avec profondeur |
| **Tech Brew** | (keyword match) | Tech news condensé |
| **a16z** | a16z@substack.com | VC insights, tech future |
| **Lore Brief** | news@lore.com | AI news condensé |
| **Technically** | technically@substack.com | Tech pratique |
| **Evan Armstrong** (The Leverage) | theleverage@substack.com | Napkin Math, business models, analyse financière |

### Tier 2 — Sujets prioritaires (bonus scoring)
Si un article de n'importe quelle source couvre ces sujets, +2 au score :

1. **IA / Intelligence Artificielle** — nouveaux modèles, applications, agents, implications
2. **Vision & Futurisme** — ce qui arrive dans 2-10 ans, signaux faibles
3. **Tendances tech IA** — adoption, cas d'usage, disruption
4. **Philosophie du futur / IA** — éthique, société, humanité augmentée
5. **Comportement humain & IA** — comment l'IA change les comportements

### Tier 3 — Sujets secondaires (score standard)
Valeur ajoutée mais pas prioritaires :

1. **CPG / Consumer Packaged Goods** — innovation produit, DTC
2. **Innovation** — nouveaux business models, disruption
3. **Tendances consommateur** — comportements, attentes, données
4. **Social & Culture** — évolutions sociétales, générations
5. **Retail & Commerce** — omnicanal, e-commerce, expérience client
6. **Marketing & Branding** — stratégies, campagnes, positionnement
7. **Media & Advertising** — évolution des médias, adtech

### Règles de scoring
```
Score = base_score + sujet_bonus + cross_reference_bonus

base_score :
  - Tier 1 source : 8
  - Tier 2 source : 6
  - Tier 3 source : 4

sujet_bonus :
  - Sujet IA/Vision/Futur/Philosophie IA/Comportement : +2
  - Sujet CPG/Innovation/Tendances/Social : +1

cross_reference_bonus :
  - Sujet mentionné par 3+ sources cette semaine : +1

Score max : 10
```

---

## Format du Digest

### Règles de rédaction (STRICT)

**Chaque entrée doit avoir de la SUBSTANCE** — pas de bullet points télégraphiques. L'objectif : que Xavier puisse lire le digest sans jamais avoir besoin de cliquer sur l'email original pour comprendre l'essentiel.

**Minimum par entrée** (Top 5 et "Par catégorie") :
- **Titre complet** de l'article/newsletter (avec numéro si dispo, ex. "Competia #175")
- **Sous-titre / thèse** : en 1 phrase, l'angle de l'auteur
- **Développement** : 6-10 phrases qui expliquent :
  - Les faits clés (chiffres, études citées avec source, noms propres, dates)
  - Les exemples concrets (entreprises, produits, cas)
  - La thèse/interprétation de l'auteur
  - Pourquoi c'est important pour Xavier (stratégie, vision, signal faible)
- **Tous les liens pertinents** extraits de l'email (pas juste 1) :
  - Lien principal vers l'article
  - Liens secondaires (études citées, outils mentionnés, articles complémentaires)
- **Citation marquante** de l'auteur (1 quote directe quand elle apporte de la valeur)

**Ton** : direct, stratégique, francophone. Pas de langue de bois. Garder les termes anglais techniques quand c'est plus précis (ex. "rage rooms", "punk health", "agentic workflow").

---

### Structure

```markdown
# 🧠 Curation Weekly
## Semaine du [lundi] au [dimanche] [mois] [année]

Brief intro (3-4 lignes) : les 2-3 signaux les plus forts de la semaine, et ce qu'ils disent de la direction du monde. Pas de fluff, pas de "cette semaine a été riche". Direct.

---

## 🔥 Top 5 de la semaine

### 1. [Source] — [Titre complet] — Score: X/10
**Thème** : [IA | Vision | Tendances | Société | Business]
**Angle** : [la thèse en 1 phrase]

[Paragraphe 1 — 3-5 phrases : les faits, les chiffres, les noms, les études citées avec source d'origine. Ne pas perdre de détail précis.]

[Paragraphe 2 — 3-5 phrases : l'interprétation de l'auteur, sa thèse, ses prédictions. Inclure une citation directe si pertinente.]

[Paragraphe 3 (optionnel) — 2-3 phrases : pourquoi c'est important pour Xavier, signal faible, implication stratégique.]

> "Citation marquante de l'auteur si elle apporte une valeur propre."
> — [Auteur]

**🔗 Liens** :
- [Article principal](URL)
- [Étude Stanford citée](URL)
- [Outil mentionné](URL)
- [Article complémentaire](URL)

---

### 2. [Source] — [Titre] — Score: X/10
[Même format qu'au-dessus, développement complet]

---

[...entrées 3, 4, 5 même format]

---

## 📡 Tendances de la semaine

Sujets détectés dans 3+ newsletters cette semaine. Pour chaque tendance, aller au-delà de la simple mention : identifier la **convergence d'angle** et la **divergence**.

### Tendance 1 : [Nom de la tendance]
**Sources** : [Source A], [Source B], [Source C], [Source D]

[Paragraphe de 4-6 phrases qui explique :
- Ce que chaque source dit spécifiquement (leur angle, leur chiffre)
- Les convergences (qu'est-ce qui est unanime ?)
- Les divergences (où se séparent-ils ?)
- Ce que ça signifie en sous-texte]

**🔗 Liens clés** :
- [Article A](URL) — [angle]
- [Article B](URL) — [angle]
- [Article C](URL) — [angle]

---

### Tendance 2 : [Nom]
[Même format]

---

### Tendance 3 : [Nom]
[Même format]

---

## 📚 Par catégorie

Pour chaque catégorie, toutes les newsletters de la semaine dans cette catégorie, avec un niveau de détail **intermédiaire** (pas aussi profond que le Top 5 mais pas un bullet sec non plus).

### 🤖 IA & Tech ([X] newsletters)

#### **[Source]** — [Titre complet]
[4-6 phrases : les points clés, les chiffres, les entreprises citées, la thèse. Inclure les études/sources citées.]
**🔗** : [Article](URL) | [Ressource citée](URL)

#### **[Source]** — [Titre]
[Format identique]

[...autant que nécessaire pour la catégorie]

---

### 🔮 Vision & Futurisme ([X] newsletters)
[Même format]

---

### 📊 Business & Startups ([X] newsletters)
[Même format]

---

### 🛍️ Retail, CPG & Commerce ([X] newsletters)
[Même format]

---

### 🎨 Culture, Société & Tendances ([X] newsletters)
[Même format]

---

### 📢 Marketing, Media & Pub ([X] newsletters)
[Même format]

---

## 💎 La pépite de la semaine

L'insight, la citation ou le data point le plus frappant de la semaine. Celui qui mérite d'être retweet, partagé, cité en réunion.

> "Citation complète avec contexte."

**— [Auteur], [Newsletter] #[numéro]**

[2-3 phrases de contexte : qui dit ça, pourquoi ça frappe, ce que ça implique.]

🔗 [Source](URL)

---

## 📈 Radar

Signaux plus faibles ou mentions honorables qui ne sont pas dans le Top 5 mais méritent d'être gardés en tête. Format plus court (2-3 phrases) mais toujours substantiel.

- **[Sujet]** via [Source] — [2-3 phrases de substance : le fait, le chiffre ou l'angle, pourquoi le noter]. 🔗 [lien](URL)
- **[Sujet]** via [Source] — [idem]. 🔗 [lien](URL)
- **[Sujet]** via [Source] — [idem]. 🔗 [lien](URL)
- [...5-8 entrées]

---

## 📊 Stats de la semaine

- **Newsletters reçues** : X
- **Newsletters analysées** : X
- **Score moyen** : X/10
- **Catégorie dominante** : X (X%)
- **Source la plus prolifique** : X (X emails)
- **Sources silencieuses cette semaine** : [liste des sources attendues qui n'ont rien envoyé]
- **Sujets émergents à surveiller** : [2-3 sujets qui ont commencé à apparaître mais pas encore Tier tendance]

---

*Généré automatiquement par Claude — Curation Digest Skill*
*Prochaine édition : lundi [date]*
```

### Exemple de niveau de détail attendu (BAD vs GOOD)

**❌ BAD (trop court, pas assez de substance)** :
```
Estelle Metayer — Competia #175 — Dinergoths, robustness, and punk health
Signaux forts : rage rooms (90% de clientes femmes, demande surge), fictional boyfriend market,
chatbot companionship + solitude, Gen Beta arrive. L'âge de la robustesse.
```

**✅ GOOD (le minimum acceptable)** :
```
### Estelle Métayer — Competia #175 — "Dinergoths, robustness, and punk health"
**Thème** : Société, comportement, signaux faibles
**Angle** : Nous entrons dans "l'âge de la robustesse" — réponse des individus aux polycrises
(climat, géopolitique, fatigue numérique).

Metayer identifie cette semaine 4 signaux convergents. D'abord les **rage rooms** — ces espaces
où l'on paie pour détruire de la vaisselle : 90% de clientèle féminine, croissance à deux
chiffres selon une étude du MIT Senseable City Lab. Second signal : le marché des
**"fictional boyfriends"** — applis comme Replika ou Character.ai qui permettent de
"ressusciter" un partenaire imaginaire moyennant abonnement ($9-30/mois). Troisième : une
étude Stanford (parue le 10 avril) montre que les chatbots companion sont perçus comme
"trop flatteurs" par 67% des utilisateurs réguliers, et que cette sycophantie augmente la
solitude ressentie au lieu de la réduire. Enfin, l'arrivée de la **Gen Beta** (née depuis
2025) que Metayer décrit comme "la première génération entièrement grandie avec des agents IA
comme compagnons de jeu dès 3 ans".

Sa thèse : face aux polycrises, les gens cherchent des façons de **ré-incarner** le réel —
physiquement (rage rooms, sport de contact, "punk health"), émotionnellement (connexions
simulées mais assumées), et générationnellement (Gen Beta redéfinit ce qu'est "un ami").

> "We are witnessing the end of polite consumption. Robustness is not about being strong —
> it's about being loud, physical, unpolished in a world that feels increasingly fake."
> — Estelle Métayer

**Pourquoi c'est important** : ces signaux alimentent directement la stratégie de marques,
retail, CPG et média. Le "robustness" pourrait remplacer "wellness" comme code culturel
dominant d'ici 18 mois.

**🔗 Liens** :
- [Competia #175 — article complet](https://competia.substack.com/p/175)
- [Étude Stanford chatbots sycophancy](https://...)
- [MIT Senseable City Lab — rage rooms data](https://...)
- [Character.ai pricing](https://...)
```

---

## Mapping complet des sources

### CURATION/Marketing & Brand Strategy
| Source | Email | Tier |
|--------|-------|------|
| CustomerCamp | kbo@customercamp.co | 3 |
| DTC Newsletter | rebecca@read.directtoconsumer.co | 3 |
| Express Checkout | expresscheckout@substack.com | 3 |
| Kyle Poyar | 1234kyle5678@substack.com | 3 |
| Sociology of Business | andjelicaaa@substack.com | **1** |
| Because of Marketing | becauseofmarketing@substack.com | 3 |
| The Storyline | thestoryline@substack.com | 3 |
| Rishad Tobaccowala | rishad@substack.com | 3 |
| Hyper Studios | hyperstudios@substack.com | 3 |

### CURATION/Retail & Commerce
| Source | Email | Tier |
|--------|-------|------|
| Modern Retail Daily | daily@mail.modernretail.co | 3 |
| Modern Retail Weekly | ecommerceweekly@mail.modernretail.co | 3 |
| CPG-D | team@cpgd.xyz | 3 |
| Future Commerce | hello@futurecommerce.com | 3 |
| Retail Brew | (keyword) | 3 |

### CURATION/Beauty & Wellness
| Source | Email | Tier |
|--------|-------|------|
| Beyond Beauty | beyondbeauty@substack.com | 3 |

### CURATION/AI & Tech
| Source | Email | Tier |
|--------|-------|------|
| Every | hello@every.to | **1** |
| Ben's Bites | bensbites@substack.com | 2 |
| Lore Brief | news@lore.com | **1** |
| AI Product Management | huryn+ai-product-management@substack.com | 2 |
| WYED | noreply@wheresyoured.at | 2 |
| Exploding Topics | info@explodingtopics.com | 2 |
| Wonder Tools | wondertools@substack.com | 2 |
| Daniel Eckler | hi@danieleckler.com | **1** |
| The Daily Upside CIO | team@cio.thedailyupside.com | 3 |

### CURATION/Product & Startups
| Source | Email | Tier |
|--------|-------|------|
| Lenny's Newsletter | lenny@substack.com | 2 |
| Late Checkout | gregsletter@latecheckout.studio | 2 |
| a16z | a16z@substack.com | **1** |
| Not Boring | notboring@substack.com | **1** |
| Operators | news@operatorscontent.com | 2 |
| Alexandre Dana | alexandre@substack.com | 3 |
| NBT | nbt@substack.com | 2 |
| Erik Torenberg | eriktorenberg@substack.com | 2 |
| Le Plongeoir | leplongeoir@substack.com | 3 |

### CURATION/Business News
| Source | Email | Tier |
|--------|-------|------|
| Morning Brew | crew@morningbrew.com | 2 |
| The Hustle | news@thehustle.co | **1** |
| Morning Consult | reply@mail.morningconsult.com | 3 |
| TrendHunter | trendcandy@trendhunter.com | **1** |
| Tech Brew | (keyword) | **1** |

### CURATION/Media & Advertising
| Source | Email | Tier |
|--------|-------|------|
| The Rebooting | the-rebooting@mail.therebooting.com | 3 |
| Mike Shields | mikeshields@substack.com | 3 |
| Troy Young | troyyoung@substack.com | 3 |

### CURATION/Culture & Misc
| Source | Email | Tier |
|--------|-------|------|
| Garbage Day | hi@www.garbageday.email | 2 |
| Dense Discovery | hello@densediscovery.com | 2 |
| CTVC | hello@ctvc.co | 2 |
| Tech Trash | hello@techtrash.fr | 3 |
| La Mutante | lamutante@substack.com | 2 |
| Marie Dolle | mariedolle@substack.com | **1** |
| Digital Native | digitalnative@substack.com | 2 |
| The Weekender | post+the-weekender@substack.com | 3 |
| Benedict Evans | list@ben-evans.com | **1** |

---

## Sources Tier 1 — toutes mappées ✅

Toutes les sources prioritaires sont identifiées :
- Estelle Métayer → competia@substack.com
- The Senses by Future Commerce → hello@futurecommerce.com (Tier 1 upgrade)
- Technically → technically@substack.com
- Evan Armstrong (The Leverage) → theleverage@substack.com

---

## Configuration

### Paramètres
```yaml
frequency: weekly
day: wednesday
time: "08:00"
timezone: Europe/Paris
delivery: email
recipient: xvironneau@gmail.com
subject_prefix: "🧠 Curation Weekly"
lookback_days: 7
max_articles_per_source: 3
top_n: 5
language: french
```

### Dépendances
- Gmail MCP (lecture des emails)
- Gmail MCP (création de brouillon pour envoi)
- scheduled-tasks MCP (déclenchement lundi 8h)

---

## Prompt d'exécution (utilisé par le scheduled task)

```
Exécute la skill Curation Weekly Digest.

1. Utilise gmail_search_messages pour récupérer tous les emails des 7 derniers jours
   provenant des expéditeurs listés dans le mapping (voir SKILL.md).
   Filtre : after:YYYY/MM/DD (7 jours avant aujourd'hui)
   Pour chaque expéditeur de Tier 1, 2, 3 : from:<email>

2. Pour chaque email trouvé, utilise gmail_read_message pour obtenir le contenu complet.

3. Applique le scoring (Tier source + bonus sujet + cross-reference).

4. Rédige le digest en suivant EXACTEMENT le format "Format du Digest" du SKILL.md :
   - Top 5 de la semaine (les scores les plus hauts)
   - Tendances transversales
   - Par catégorie (IA, Vision, Business, Retail, Culture, Marketing)
   - Pépite de la semaine
   - Radar
   - Stats

5. Utilise gmail_create_draft pour créer un brouillon :
   - to: xvironneau@gmail.com
   - subject: "🧠 Curation Weekly — Semaine du [lundi N-1] au [dimanche]"
   - body: le digest en HTML (contentType: text/html)
   - Convertis le markdown du digest en HTML propre

6. Confirme la création du brouillon avec son draftId.

Note : le brouillon est créé mais NON envoyé automatiquement. Xavier peut relire avant envoi.
Si Xavier veut l'envoi automatique, passer à l'étape d'envoi du draft.
```

---

## Évolutions futures
- Ajouter un score d'engagement (est-ce que Xavier ouvre/clique sur les liens ?)
- Intégrer Telegram comme canal de livraison alternatif
- Mode "flash" en milieu de semaine si un sujet majeur émerge
- Dashboard web avec historique des digests
- Envoi automatique (vs brouillon) après validation du format sur 2-3 semaines
