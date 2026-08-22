import { useMemo } from "react";

export interface ActivityHeatmapProps {
  /** ISO timestamps of the things being counted — one entry per post. */
  dates: string[];
  isJapanese: boolean;
}

const WEEKS = 53;
const DAYS_PER_WEEK = 7;

/** Local midnight, so a post is counted on the day its author experienced, not the UTC day. */
function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

/**
 * A year of activity in the GitHub arrangement: one column per week, one cell per day, oldest at the
 * left. Built from elements rather than an SVG because each cell carries a title for hover, which is
 * markup the browser already handles.
 */
export default function ActivityHeatmap({ dates, isJapanese }: ActivityHeatmapProps) {
  const { weeks, total, max } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const iso of dates) {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) continue;
      const key = dayKey(startOfDay(date));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    // The grid ends on the current week and runs back a year, so today is always in the last column.
    const end = startOfDay(new Date());
    end.setDate(end.getDate() + (6 - end.getDay()));

    const built: { date: Date; count: number }[][] = [];
    let highest = 0;

    for (let week = WEEKS - 1; week >= 0; week--) {
      const column: { date: Date; count: number }[] = [];
      for (let day = 0; day < DAYS_PER_WEEK; day++) {
        const date = new Date(end);
        date.setDate(end.getDate() - (week * DAYS_PER_WEEK + (DAYS_PER_WEEK - 1 - day)));
        const count = counts.get(dayKey(date)) ?? 0;
        highest = Math.max(highest, count);
        column.push({ date, count });
      }
      built.push(column);
    }

    return { weeks: built, total: dates.length, max: highest };
  }, [dates]);

  /** Five buckets scaled to this profile's own busiest day: activity is relative to the person. */
  const level = (count: number): number => {
    if (count === 0 || max === 0) return 0;
    return Math.min(4, Math.ceil((count / max) * 4));
  };

  const label = isJapanese
    ? `過去1年間の投稿 ${total} 件`
    : `${total} post${total === 1 ? "" : "s"} in the last year`;

  return (
    <section className="heatmap">
      <div className="heatmap-grid" role="img" aria-label={label}>
        {weeks.map((column, i) => (
          <div className="heatmap-week" key={i}>
            {column.map(({ date, count }) => (
              <span
                key={date.toISOString()}
                className="heatmap-day"
                data-level={level(count)}
                title={`${date.toLocaleDateString(isJapanese ? "ja-JP" : "en-US")} — ${count}`}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="heatmap-caption">{label}</p>
    </section>
  );
}
