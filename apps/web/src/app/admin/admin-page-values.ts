export function parsePositivePage(raw: string | undefined) {
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 10_000
    ? parsed
    : 1;
}

export function parseShanghaiDateBoundary(
  raw: string | undefined,
  end = false,
) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw ?? "");
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return undefined;
  return new Date(`${raw}T${end ? "23:59:59.999" : "00:00:00.000"}+08:00`);
}

const shanghaiDateTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function formatShanghaiDateTime(raw: string) {
  const parts = Object.fromEntries(
    shanghaiDateTime
      .formatToParts(new Date(raw))
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
