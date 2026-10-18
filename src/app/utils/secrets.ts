// Inline DM-only sections, shared by the server (search, entity API) and the
// page renderer. No Node imports here, so client components can use it too.

// The section starts at a level-2 heading that names the DM (or GM) as a word:
// "## Secrets (DM only)" by convention, but also translated headings such as
// "## Segreti (solo DM)". By convention it runs to the end of the page.
// Matching loosely fails closed: a stray "DM" heading hides more, never less.
export const DM_SECRETS_HEADING = /^##[ \t]+.*\b(?:DM|GM)\b.*$/im;

// Splits a page body into what players may see and the DM-only section.
export function splitDmSecrets(body: string): { publicBody: string; dmBody: string } {
  const match = body.match(DM_SECRETS_HEADING);
  if (!match || match.index === undefined) return { publicBody: body, dmBody: '' };
  return { publicBody: body.slice(0, match.index).trimEnd(), dmBody: body.slice(match.index) };
}

export function isDmSecretsHeading(line: string): boolean {
  return DM_SECRETS_HEADING.test(line);
}
