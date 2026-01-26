/**
 * Calendar page - redirects to today's date or event start date
 * Route: /calendar
 */

import { redirect } from 'next/navigation';
import settings from '../../../settings.json';

export default function CalendarPage() {
  const today = new Date();
  const eventStart = new Date(settings.eventDates.start + 'T00:00:00');
  const eventEnd = new Date(settings.eventDates.end + 'T23:59:59');

  // Determine which date to show
  let targetDate: Date;

  if (today >= eventStart && today <= eventEnd) {
    // During the event, show today
    targetDate = today;
  } else if (today < eventStart) {
    // Before the event, show the start date
    targetDate = eventStart;
  } else {
    // After the event, show the last day
    targetDate = eventEnd;
  }

  // Format date for URL
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');

  redirect(`/calendar/${year}/${month}/${day}`);
}

export const metadata = {
  title: 'Schedule | Open Source Village',
  description: 'View the schedule of workshops and events at Open Source Village.',
};
