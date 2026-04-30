/**
 * Newsletter sources for the Curation Weekly Digest.
 * Source of truth: SKILL.md §Mapping complet des sources.
 *
 * Tier drives the base scoring; see ./score.ts.
 */

import type { CurationCategory } from '../shared/types.js';

export type Tier = 1 | 2 | 3;

export interface CurationSource {
  name: string;
  email?: string;          // empty when matched by keyword (Tech Brew, Retail Brew)
  keywords?: string[];     // fallback match in From: or Subject:
  tier: Tier;
  category: CurationCategory;
}

export const CURATION_SOURCES: CurationSource[] = [
  // ----------------------------- Tier 1 ----------------------------------
  { name: 'Estelle Métayer (Competia)', email: 'competia@substack.com', tier: 1, category: 'vision-future' },
  { name: 'Daniel Eckler', email: 'hi@danieleckler.com', tier: 1, category: 'vision-future' },
  { name: 'The Sociology of Business', email: 'andjelicaaa@substack.com', tier: 1, category: 'culture-society' },
  { name: 'Marie Dolle', email: 'mariedolle@substack.com', tier: 1, category: 'culture-society' },
  { name: 'Every', email: 'hello@every.to', tier: 1, category: 'ai-tech' },
  { name: 'The Hustle', email: 'news@thehustle.co', tier: 1, category: 'business-startups' },
  { name: 'The Senses by Future Commerce', email: 'hello@futurecommerce.com', tier: 1, category: 'retail-cpg-commerce' },
  { name: 'Benedict Evans', email: 'list@ben-evans.com', tier: 1, category: 'ai-tech' },
  { name: 'TrendHunter', email: 'trendcandy@trendhunter.com', tier: 1, category: 'culture-society' },
  { name: 'Not Boring', email: 'notboring@substack.com', tier: 1, category: 'business-startups' },
  { name: 'Tech Brew', keywords: ['tech brew', 'morningbrew.com'], tier: 1, category: 'ai-tech' },
  { name: 'a16z', email: 'a16z@substack.com', tier: 1, category: 'business-startups' },
  { name: 'Lore Brief', email: 'news@lore.com', tier: 1, category: 'ai-tech' },
  { name: 'Technically', email: 'technically@substack.com', tier: 1, category: 'ai-tech' },
  { name: 'Evan Armstrong (The Leverage)', email: 'theleverage@substack.com', tier: 1, category: 'business-startups' },

  // ----------------------------- Tier 2 ----------------------------------
  { name: "Ben's Bites", email: 'bensbites@substack.com', tier: 2, category: 'ai-tech' },
  { name: 'WYED', email: 'noreply@wheresyoured.at', tier: 2, category: 'ai-tech' },
  { name: 'Exploding Topics', email: 'info@explodingtopics.com', tier: 2, category: 'ai-tech' },
  { name: 'AI Product Management', email: 'huryn+ai-product-management@substack.com', tier: 2, category: 'ai-tech' },
  { name: 'Wonder Tools', email: 'wondertools@substack.com', tier: 2, category: 'ai-tech' },
  { name: "Lenny's Newsletter", email: 'lenny@substack.com', tier: 2, category: 'business-startups' },
  { name: 'Late Checkout', email: 'gregsletter@latecheckout.studio', tier: 2, category: 'business-startups' },
  { name: 'Operators', email: 'news@operatorscontent.com', tier: 2, category: 'business-startups' },
  { name: 'NBT', email: 'nbt@substack.com', tier: 2, category: 'business-startups' },
  { name: 'Erik Torenberg', email: 'eriktorenberg@substack.com', tier: 2, category: 'business-startups' },
  { name: 'Morning Brew', email: 'crew@morningbrew.com', tier: 2, category: 'business-startups' },
  { name: 'Garbage Day', email: 'hi@www.garbageday.email', tier: 2, category: 'culture-society' },
  { name: 'Dense Discovery', email: 'hello@densediscovery.com', tier: 2, category: 'culture-society' },
  { name: 'CTVC', email: 'hello@ctvc.co', tier: 2, category: 'culture-society' },
  { name: 'La Mutante', email: 'lamutante@substack.com', tier: 2, category: 'culture-society' },
  { name: 'Digital Native', email: 'digitalnative@substack.com', tier: 2, category: 'culture-society' },

  // ----------------------------- Tier 3 ----------------------------------
  { name: 'CustomerCamp', email: 'kbo@customercamp.co', tier: 3, category: 'marketing-media' },
  { name: 'DTC Newsletter', email: 'rebecca@read.directtoconsumer.co', tier: 3, category: 'marketing-media' },
  { name: 'Express Checkout', email: 'expresscheckout@substack.com', tier: 3, category: 'marketing-media' },
  { name: 'Kyle Poyar', email: '1234kyle5678@substack.com', tier: 3, category: 'marketing-media' },
  { name: 'Because of Marketing', email: 'becauseofmarketing@substack.com', tier: 3, category: 'marketing-media' },
  { name: 'The Storyline', email: 'thestoryline@substack.com', tier: 3, category: 'marketing-media' },
  { name: 'Rishad Tobaccowala', email: 'rishad@substack.com', tier: 3, category: 'marketing-media' },
  { name: 'Hyper Studios', email: 'hyperstudios@substack.com', tier: 3, category: 'marketing-media' },

  { name: 'Modern Retail Daily', email: 'daily@mail.modernretail.co', tier: 3, category: 'retail-cpg-commerce' },
  { name: 'Modern Retail Weekly', email: 'ecommerceweekly@mail.modernretail.co', tier: 3, category: 'retail-cpg-commerce' },
  { name: 'CPG-D', email: 'team@cpgd.xyz', tier: 3, category: 'retail-cpg-commerce' },
  { name: 'Future Commerce', email: 'hello@futurecommerce.com', tier: 3, category: 'retail-cpg-commerce' },
  { name: 'Retail Brew', keywords: ['retail brew'], tier: 3, category: 'retail-cpg-commerce' },

  { name: 'Beyond Beauty', email: 'beyondbeauty@substack.com', tier: 3, category: 'retail-cpg-commerce' },

  { name: 'The Daily Upside CIO', email: 'team@cio.thedailyupside.com', tier: 3, category: 'ai-tech' },
  { name: 'Alexandre Dana', email: 'alexandre@substack.com', tier: 3, category: 'business-startups' },
  { name: 'Le Plongeoir', email: 'leplongeoir@substack.com', tier: 3, category: 'business-startups' },

  { name: 'Morning Consult', email: 'reply@mail.morningconsult.com', tier: 3, category: 'business-startups' },

  { name: 'The Rebooting', email: 'the-rebooting@mail.therebooting.com', tier: 3, category: 'marketing-media' },
  { name: 'Mike Shields', email: 'mikeshields@substack.com', tier: 3, category: 'marketing-media' },
  { name: 'Troy Young', email: 'troyyoung@substack.com', tier: 3, category: 'marketing-media' },

  { name: 'Tech Trash', email: 'hello@techtrash.fr', tier: 3, category: 'culture-society' },
  { name: 'The Weekender', email: 'post+the-weekender@substack.com', tier: 3, category: 'culture-society' },
];

const BY_EMAIL = new Map<string, CurationSource>();
for (const src of CURATION_SOURCES) {
  if (src.email) BY_EMAIL.set(src.email.toLowerCase(), src);
}

/**
 * Find the matching CurationSource for a parsed thread, by email first then
 * by keyword in From/Subject. Returns undefined if no match (still allowed
 * but treated as Tier 3 fallback by score.ts).
 */
export function findSource(args: {
  fromEmail: string;
  fromName: string;
  subject: string;
}): CurationSource | undefined {
  const byEmail = BY_EMAIL.get(args.fromEmail.toLowerCase());
  if (byEmail) return byEmail;

  const haystack = `${args.fromEmail} ${args.fromName} ${args.subject}`.toLowerCase();
  for (const src of CURATION_SOURCES) {
    if (src.keywords && src.keywords.some((kw) => haystack.includes(kw.toLowerCase()))) {
      return src;
    }
  }
  return undefined;
}

/** Build the Gmail `from:` clause that captures every Tier-1/2/3 sender. */
export function buildGmailQuery(afterDate: string): string {
  const emails = CURATION_SOURCES
    .map((s) => s.email)
    .filter((e): e is string => Boolean(e));
  const fromClause = emails.map((e) => `from:${e}`).join(' OR ');
  return `after:${afterDate} (${fromClause}) -in:trash -in:spam`;
}

/** All Tier-1 sources for "silent sources this week" stats. */
export function tier1Sources(): CurationSource[] {
  return CURATION_SOURCES.filter((s) => s.tier === 1);
}
