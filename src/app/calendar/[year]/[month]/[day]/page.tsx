/**
 * Calendar page for a specific date
 * Route: /calendar/[year]/[month]/[day]
 * Example: /calendar/2026/01/28
 */

import { notFound } from 'next/navigation';
import CalendarView from '@/components/CalendarView';
import settings from '../../../../../../settings.json';

interface PageProps {
  params: Promise<{
    year: string;
    month: string;
    day: string;
  }>;
}

export default async function CalendarDatePage({ params }: PageProps) {
  const { year, month, day } = await params;

  // Parse and validate date
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);
  const dayNum = parseInt(day, 10);

  // Validate date components
  if (
    isNaN(yearNum) ||
    isNaN(monthNum) ||
    isNaN(dayNum) ||
    monthNum < 1 ||
    monthNum > 12 ||
    dayNum < 1 ||
    dayNum > 31
  ) {
    notFound();
  }

  // Create date object (month is 0-indexed in JS)
  const date = new Date(yearNum, monthNum - 1, dayNum);

  // Validate the date is real (e.g., not Feb 30)
  if (
    date.getFullYear() !== yearNum ||
    date.getMonth() !== monthNum - 1 ||
    date.getDate() !== dayNum
  ) {
    notFound();
  }

  return (
    <CalendarView
      initialDate={date}
      eventDates={settings.eventDates}
    />
  );
}

// Generate metadata for the page
export async function generateMetadata({ params }: PageProps) {
  const { year, month, day } = await params;

  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    title: `Schedule - ${formattedDate} | Open Source Village`,
    description: `View events and workshops scheduled for ${formattedDate} at Open Source Village.`,
  };
}
