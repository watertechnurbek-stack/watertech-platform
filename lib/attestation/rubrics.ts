import "server-only";
import type { AssessmentDay } from "./types";

// The Part B rubrics (docs/ATTESTATION.md §4). CONFIDENTIAL: knowing the
// criteria and their weights is how a candidate would game the evaluator, so
// this module is `server-only` — no client bundle, the admin's included, can
// contain it. The admin settings page renders it on the server.
//
// A criterion's id is stable: the evaluator's scores (assessment_attempts.
// rubric) name it, and so does its label, `pages.admin.assessments.rubric.
// day<N>.<id>` in both message files. `goodLooksLike` is for the evaluator's
// prompt (S05), not UI copy. Weights are integers and sum to 100 per day —
// tests/unit/attestation/rubrics.test.ts holds all of this.

export interface RubricCriterion {
  readonly id: string;
  readonly weight: number;
  /** next-intl key of the criterion's label (admin only). */
  readonly labelKey: string;
  /** One line for the evaluator: what a full score looks like. */
  readonly goodLooksLike: string;
}

export interface Rubric {
  readonly day: AssessmentDay;
  readonly criteria: readonly RubricCriterion[];
}

/** Namespace of the criteria labels. */
export const RUBRIC_MESSAGES = "pages.admin.assessments.rubric";

function rubric(day: AssessmentDay, criteria: readonly [id: string, weight: number, goodLooksLike: string][]): Rubric {
  return {
    day,
    criteria: criteria.map(([id, weight, goodLooksLike]) => ({
      id,
      weight,
      labelKey: `${RUBRIC_MESSAGES}.day${day}.${id}`,
      goodLooksLike,
    })),
  };
}

export const RUBRICS: Readonly<Record<AssessmentDay, Rubric>> = {
  // First-time caller: a homeowner or a small shop owner.
  1: rubric(1, [
    ["greeting", 15, "Greets politely, names themself and WaterTech, asks the customer's name and for a moment to talk."],
    ["companyFacts", 25, "States company facts that match the fact sheet (warranty, standards, technology) and invents none."],
    ["productLines", 25, "Names the right product lines (PPR for hot and cold water, sewer) and matches them to the need."],
    ["needsDiscovery", 15, "Asks open questions about the object, the use and the volume before recommending anything."],
    ["nextStep", 10, "Ends with a concrete next step: a price list sent, a callback at a named day and time, or a visit."],
    ["courtesy", 10, "Stays polite and patient, uses the customer's name, never argues or pressures."],
  ]),
  // Technical installer (usta) with one competitor claim.
  2: rubric(2, [
    ["technicalAccuracy", 35, "Every technical claim (sizes, pressure, temperature, materials, installation) matches the fact sheet."],
    ["technicalDiscovery", 20, "Asks about the object type, working pressure, water temperature and pipe diameter before answering."],
    ["competitorComparison", 15, "Answers the competitor claim with facts from the fact sheet, never by disparaging the competitor."],
    ["clarity", 15, "Explains technical points simply and precisely, in short sentences an installer can act on."],
    ["nextStep", 15, "Agrees a concrete next step (samples, a technical sheet, a meeting or an order) with a day and time."],
  ]),
  // Dealer or wholesale buyer.
  3: rubric(3, [
    ["segmentDiscovery", 25, "Finds out the buyer's segment (dealer, wholesaler, shop), region, volumes and current suppliers."],
    ["crmNextStep", 20, "Names the correct CRM next step for the outcome: the funnel stage and a task with a date."],
    ["termsAccuracy", 25, "Quotes packages, discounts, advance and credit terms exactly as the fact sheet gives them."],
    ["objectionHandling", 15, "Acknowledges the objection, finds the real concern and answers with value, not with a discount."],
    ["communication", 15, "Listens, summarises the buyer's needs back and keeps a professional, confident tone."],
  ]),
  // The full sales call: two objections and one competitor claim.
  4: rubric(4, [
    ["opening", 10, "Opens warmly, introduces themself and WaterTech, gets permission to talk and uses the customer's name."],
    ["needsDiscovery", 15, "Uses situation and problem questions (SPIN) to uncover the needs before presenting."],
    ["valuePresentation", 15, "Presents feature, advantage and benefit (FAB) tied to the needs the customer stated."],
    ["objections", 25, "Handles both objections: acknowledges, finds the real reason, answers with facts and value."],
    ["factualAccuracy", 15, "Every fact about products, terms and competitors matches the fact sheet; no invented promises."],
    ["close", 15, "Closes with an order or an agreed next step at a concrete day and time — never 'call me later'."],
    ["standards", 5, "Follows the communication standards: polite forms of address, no slang, the outcome logged in the CRM."],
  ]),
};

export function rubricFor(day: AssessmentDay): Rubric {
  return RUBRICS[day];
}
