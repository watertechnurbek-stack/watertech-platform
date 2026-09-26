import { z } from "zod";

/** Validation messages are keys, not sentences. A zod schema in
 * lib/admin/schemas.ts is parsed on the server (inside a Server Action) and on
 * the client (zodResolver in EntityForm/ScriptEditor/SopEditor), and neither
 * place should decide how a Russian manager reads "this field is required" —
 * so an issue carries one of these keys and the component resolves it through
 * `admin.validation.<key>` in messages/uz.json and messages/ru.json.
 *
 * Keys are only added here when a schema (or `adminErrorMap` below) can
 * actually produce them; tests/unit/admin/messages.test.ts checks both locales
 * carry every one. */
export const VALIDATION_KEYS = [
  "required",
  "invalid",
  "slug",
  "number",
  "minItems",
  "tooShort",
  "tooLong",
  "stageIdDuplicate",
  "minSteps",
  // Product photo upload (lib/admin/product-image.ts).
  "imageType",
  "imageTooLarge",
  // Removing a person: the typed confirmation is not their email (lib/admin/users.ts).
  "confirmMismatch",
  // The attestation's item bank and settings (lib/attestation/schemas.ts).
  "outOfRange",
  "optionsCount",
  "duplicateOptionId",
  "sourceRef",
  "weightsSum",
  "thresholdsOrder",
  "turnsOrder",
  "publishOptionsCount",
  "publishKeyInOptions",
  "publishKeyCount",
  "publishBothLocales",
  "publishPromptLength",
  "publishOptionLength",
  "publishUniqueOptions",
] as const;

export type ValidationKey = (typeof VALIDATION_KEYS)[number];

const VALIDATION_KEY_SET: ReadonlySet<string> = new Set(VALIDATION_KEYS);

export function isValidationKey(value: string): value is ValidationKey {
  return VALIDATION_KEY_SET.has(value);
}

/** How many issue messages an ActionResult carries back. A form shows its own
 * per-field errors; the list is there so a save that fails outside a field
 * (a script's stage tree, an SOP's steps) still says what was wrong. */
export const VALIDATION_DETAIL_LIMIT = 5;

/** Resolves one issue message for display: a key goes through next-intl, and
 * anything else (an id a reference check could not resolve, a message a
 * shared content schema in lib/content/schemas.ts spells out itself) is shown
 * as it came. Client components pass a `useTranslations("admin.validation")`
 * translator. */
export function validationText(translate: (key: string) => string, message: string): string {
  return isValidationKey(message) ? translate(message) : message;
}

/** Fills in the issues a schema does not spell out itself — a missing field,
 * a value of the wrong type, an enum that is not one of the options. zod's
 * precedence puts an explicit `message` first, so the keys the admin schemas
 * already pass (`"required"`, `"slug"`, …) win over anything decided here.
 *
 * Passed per parse (`schema.parse(input, { errorMap: adminErrorMap })`,
 * `zodResolver(schema, { errorMap: adminErrorMap })`) rather than installed
 * with `z.setErrorMap` — the same zod is used by lib/env.ts and the API routes,
 * whose messages are read by developers, not managers. */
export const adminErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined" || issue.received === "null") return { message: "required" };
      // A number field bound with valueAsNumber hands over NaN when left empty
      // or typed with letters (the attestation settings form).
      return { message: issue.expected === "number" ? "number" : "invalid" };
    case z.ZodIssueCode.too_small:
      if (issue.type === "array") return { message: issue.minimum === 1 ? "minItems" : "tooShort" };
      if (issue.type === "string") return { message: issue.minimum === 1 ? "required" : "tooShort" };
      return { message: "number" };
    case z.ZodIssueCode.too_big:
      return { message: "tooLong" };
    case z.ZodIssueCode.invalid_enum_value:
    case z.ZodIssueCode.invalid_string:
    case z.ZodIssueCode.invalid_literal:
      return { message: "invalid" };
    case z.ZodIssueCode.not_finite:
      return { message: "number" };
    default:
      // ctx.defaultError is zod's own English text; better than a key that
      // has no translation, and only reachable for issue kinds these schemas
      // do not produce.
      return { message: ctx.defaultError };
  }
};
