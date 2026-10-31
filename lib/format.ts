const generatedAtFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** The same text on the server and in the browser, so it can't cause a hydration mismatch. */
export function formatGeneratedAt(iso: string): string {
  return `${generatedAtFormat.format(new Date(iso))} UTC`;
}
