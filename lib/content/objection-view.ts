import type { Objection, Script } from "./types";
import { normalizeSearchText } from "@/lib/search/normalize";

/** A script an objection is handled in, with the scripts-page URL that opens
 * that objection inside the script's own "E'tiroz ustida ishlash" stage. */
export interface ObjectionScriptLink {
  id: string;
  name: string;
  href: string;
}

/** What the /sales-process/objections playbook shows for one objection —
 * the published record plus the script links resolved on the server, so the
 * client island gets plain data and never the whole scripts list. */
export interface ObjectionEntry {
  id: string;
  label: string;
  clientSays: string;
  realMeaning: string;
  response: string;
  followUp?: string;
  scripts: ObjectionScriptLink[];
  /** normalizeSearchText of every field the search looks at — computed once
   * on the server so a keystroke only runs `includes`. */
  searchText: string;
}

/** The script link for `objectionId` in `script`: the first stage that lists
 * the objection, or null when the script names it without surfacing it. */
function scriptLink(script: Script, objectionId: string): ObjectionScriptLink | null {
  const stage = script.stages.find((s) => s.objectionIds.includes(objectionId));
  if (!stage) return null;
  const query = new URLSearchParams({ script: script.id, stage: stage.id, objection: objectionId });
  return { id: script.id, name: script.name, href: `/sales-process/scripts?${query.toString()}` };
}

export function buildObjectionEntries(objections: Objection[], scripts: Script[]): ObjectionEntry[] {
  const scriptById = new Map(scripts.map((s) => [s.id, s]));
  return objections.map((o) => {
    const links = o.scriptIds
      .map((id) => scriptById.get(id))
      .filter((s): s is Script => s !== undefined)
      .map((s) => scriptLink(s, o.id))
      .filter((l): l is ObjectionScriptLink => l !== null);
    return {
      id: o.id,
      label: o.label,
      clientSays: o.clientSays,
      realMeaning: o.realMeaning,
      response: o.response,
      ...(o.followUp ? { followUp: o.followUp } : {}),
      scripts: links,
      searchText: normalizeSearchText(
        [o.label, o.keywords.join(" "), o.clientSays, o.realMeaning, o.response, o.followUp ?? ""].join(" ")
      ),
    };
  });
}

/** Entries matching every word of `query` (case, apostrophes and Cyrillic
 * normalised like the sitewide search), in their original order. An empty
 * query matches everything. */
export function filterObjectionEntries(entries: ObjectionEntry[], query: string): ObjectionEntry[] {
  const terms = normalizeSearchText(query).split(" ").filter(Boolean);
  if (terms.length === 0) return entries;
  return entries.filter((e) => terms.every((term) => e.searchText.includes(term)));
}

/** Reads the `?o=` deep link: the id when it names an entry, else null. */
export function parseObjectionParam(search: string, entries: ObjectionEntry[]): string | null {
  const id = new URLSearchParams(search).get("o");
  return id && entries.some((e) => e.id === id) ? id : null;
}
