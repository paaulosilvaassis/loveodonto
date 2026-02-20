import { format, parseISO, isBefore, isAfter, addDays, startOfDay, endOfDay } from 'date-fns';

export const formatDate = (date) => format(date, 'yyyy-MM-dd');
export const formatDateTime = (date) => format(date, 'yyyy-MM-dd HH:mm');
export const parseDate = (value) => (value ? parseISO(value) : null);

export const isWithin = (date, start, end) => {
  if (!date || !start || !end) return false;
  return (isAfter(date, start) || date.getTime() === start.getTime()) &&
    (isBefore(date, end) || date.getTime() === end.getTime());
};

export const dayRange = (date) => ({
  start: startOfDay(date),
  end: endOfDay(date),
});

export const addDaysSafe = (date, days) => addDays(date, days);
