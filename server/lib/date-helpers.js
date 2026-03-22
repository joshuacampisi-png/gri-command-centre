/**
 * Date helpers for TNT Cannon Hire system.
 * All dates are YYYY-MM-DD strings. Formatting uses Australian long format.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ordinal(day) {
  if (day >= 11 && day <= 13) return day + 'th';
  switch (day % 10) {
    case 1: return day + 'st';
    case 2: return day + 'nd';
    case 3: return day + 'rd';
    default: return day + 'th';
  }
}

/**
 * Parse a YYYY-MM-DD string into a local Date object.
 * We split manually to avoid timezone offset issues with new Date("YYYY-MM-DD").
 */
function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Takes "YYYY-MM-DD", returns "Friday, 3rd April"
 */
export function formatDateLong(dateStr) {
  const date = parseDate(dateStr);
  const dayName = DAYS[date.getDay()];
  const dayOrd = ordinal(date.getDate());
  const monthName = MONTHS[date.getMonth()];
  return `${dayName}, ${dayOrd} ${monthName}`;
}

/**
 * Returns YYYY-MM-DD string for eventDate minus 1 day.
 */
export function getPickupDate(eventDateStr) {
  const date = parseDate(eventDateStr);
  date.setDate(date.getDate() - 1);
  return toYMD(date);
}

/**
 * Returns YYYY-MM-DD string for eventDate plus 1 day.
 */
export function getReturnDate(eventDateStr) {
  const date = parseDate(eventDateStr);
  date.setDate(date.getDate() + 1);
  return toYMD(date);
}

/**
 * Returns all hire dates with both raw and formatted versions.
 */
export function getHireDates(eventDateStr) {
  const pickupDate = getPickupDate(eventDateStr);
  const returnDate = getReturnDate(eventDateStr);
  return {
    pickupDate,
    eventDate: eventDateStr,
    returnDate,
    pickupFormatted: formatDateLong(pickupDate),
    eventFormatted: formatDateLong(eventDateStr),
    returnFormatted: formatDateLong(returnDate),
  };
}
