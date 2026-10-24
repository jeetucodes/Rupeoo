/**
 * Date & Time Utilities for Local Device Timezone
 * Prevents UTC shift bugs (e.g., 12 AM - 5:30 AM in IST showing yesterday's date).
 */

/**
 * Returns a date string in YYYY-MM-DD format based on local device time.
 */
export function getLocalDateString(input?: Date | string | number): string {
  let date: Date;
  if (!input) {
    date = new Date();
  } else if (typeof input === 'string') {
    // If it's already YYYY-MM-DD, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      return input;
    }
    date = new Date(input);
  } else {
    date = new Date(input);
  }

  if (isNaN(date.getTime())) {
    date = new Date();
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Returns a month string in YYYY-MM format based on local device time.
 */
export function getLocalMonthString(input?: Date | string | number): string {
  let date: Date;
  if (!input) {
    date = new Date();
  } else if (typeof input === 'string') {
    if (/^\d{4}-\d{2}$/.test(input)) {
      return input;
    }
    date = new Date(input);
  } else {
    date = new Date(input);
  }

  if (isNaN(date.getTime())) {
    date = new Date();
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  return `${year}-${month}`;
}

/**
 * Returns a relative date string in YYYY-MM-DD format (offset in days).
 * 0 = today, -1 = yesterday, +1 = tomorrow.
 */
export function getRelativeDateString(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return getLocalDateString(d);
}

/**
 * Returns a relative month string in YYYY-MM format (offset in months).
 * 0 = this month, -1 = last month, +1 = next month.
 */
export function getRelativeMonthString(monthsOffset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsOffset);
  return getLocalMonthString(d);
}

/**
 * Shifts a YYYY-MM month string by an integer number of months.
 * e.g., shiftMonthString('2026-10', -1) => '2026-09'
 */
export function shiftMonthString(monthStr: string, offsetMonths: number): string {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) {
    return getLocalMonthString();
  }
  const [yearStr, monthNumStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthNumStr, 10) - 1;
  const d = new Date(year, month + offsetMonths, 1);
  return getLocalMonthString(d);
}

/**
 * Checks if a YYYY-MM-DD string is today in local time.
 */
export function isToday(dateStr: string): boolean {
  return getLocalDateString() === getLocalDateString(dateStr);
}

/**
 * Checks if a YYYY-MM-DD string is yesterday in local time.
 */
export function isYesterday(dateStr: string): boolean {
  return getRelativeDateString(-1) === getLocalDateString(dateStr);
}

/**
 * Parse a YYYY-MM-DD string into a local Date at 00:00:00 local time.
 */
export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day, 0, 0, 0, 0);
  }
  return new Date(dateStr);
}

/**
 * Formats a stored time as a 12-hour clock value with an AM/PM suffix.
 * Accepts both legacy HH:mm values and Date-compatible values.
 */
export function formatTime12Hour(input?: Date | string | number): string {
  if (input === undefined || input === null || input === '') return '';

  let hours: number;
  let minutes: number;

  if (typeof input === 'string') {
    const timeMatch = input.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?/);
    if (timeMatch) {
      hours = Number(timeMatch[1]);
      minutes = Number(timeMatch[2]);
      const meridiem = timeMatch[3]?.toUpperCase();
      if (meridiem === 'PM' && hours < 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;
    } else {
      const parsed = new Date(input);
      if (isNaN(parsed.getTime())) return input;
      hours = parsed.getHours();
      minutes = parsed.getMinutes();
    }
  } else {
    const date = new Date(input);
    if (isNaN(date.getTime())) return '';
    hours = date.getHours();
    minutes = date.getMinutes();
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return String(input);
  const displayHour = hours % 12 || 12;
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${meridiem}`;
}
