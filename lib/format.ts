const generatedAtFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Minutes Los Angeles is ahead of UTC at a moment. Negative, and it changes with daylight saving. */
function pacificOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(at);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  const asUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** The next midnight in Los Angeles, as an ISO time. Google resets daily quotas then. */
export function nextPacificMidnight(now: Date): string {
  const local = new Date(now.getTime() + pacificOffsetMinutes(now) * 60_000);
  const midnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1);
  // The offset at midnight itself, in case the clocks change before then.
  const estimate = new Date(midnightAsUtc - pacificOffsetMinutes(now) * 60_000);
  return new Date(midnightAsUtc - pacificOffsetMinutes(estimate) * 60_000).toISOString();
}

/** The same text on the server and in the browser, so it can't cause a hydration mismatch. */
export function formatGeneratedAt(iso: string): string {
  return `${generatedAtFormat.format(new Date(iso))} UTC`;
}
