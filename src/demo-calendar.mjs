const LEVELS = [
  'NONE',
  'FIRST_QUARTILE',
  'SECOND_QUARTILE',
  'THIRD_QUARTILE',
  'FOURTH_QUARTILE',
];

export function createDemoCalendar() {
  const start = new Date('2025-08-24T00:00:00Z');
  const regions = [
    [0, 15],
    [19, 34],
    [38, 52],
  ];
  let totalContributions = 0;

  const weeks = Array.from({ length: 53 }, (_, weekIndex) => {
    const firstDay = addDays(start, weekIndex * 7);
    const activeRegion = regions.find(
      ([from, to]) => weekIndex >= from && weekIndex <= to,
    );

    const contributionDays = Array.from({ length: 7 }, (_, weekday) => {
      const date = addDays(firstDay, weekday);
      let contributionCount = 0;

      if (activeRegion) {
        const hash = seededNumber(weekIndex, weekday);
        const distanceFromSpine = Math.abs(weekday - 3);
        const chance = 62 - distanceFromSpine * 10;
        const isSpine = weekday === 3;
        const isActive = isSpine || hash % 100 < chance;
        if (isActive) {
          contributionCount = 1 + (seededNumber(weekday + 11, weekIndex + 7) % 14);
        }
      }

      totalContributions += contributionCount;
      return {
        date: formatDate(date),
        weekday,
        contributionCount,
        contributionLevel: levelForCount(contributionCount),
        color: null,
      };
    });

    return {
      firstDay: formatDate(firstDay),
      contributionDays,
    };
  });

  return {
    owner: 'demo',
    displayName: 'Demo profile',
    calendar: {
      totalContributions,
      weeks,
    },
  };
}

function levelForCount(count) {
  if (count === 0) return LEVELS[0];
  if (count <= 3) return LEVELS[1];
  if (count <= 7) return LEVELS[2];
  if (count <= 11) return LEVELS[3];
  return LEVELS[4];
}

function seededNumber(left, right) {
  let value = Math.imul(left + 17, 1_103_515_245) ^ Math.imul(right + 29, 12_345);
  value ^= value >>> 16;
  return Math.abs(value);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}
