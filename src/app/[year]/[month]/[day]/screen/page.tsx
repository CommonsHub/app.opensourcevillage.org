/**
 * TV Screen Display - Specific date
 * Route: /[year]/[month]/[day]/screen
 * Example: /2026/01/28/screen
 */

'use client';

import { useMemo } from 'react';
import { useParams, notFound } from 'next/navigation';
import ScreenDisplay from '@/components/ScreenDisplay';

export default function DateScreenPage() {
  const params = useParams();

  // Parse date from URL params
  const date = useMemo(() => {
    const year = parseInt(params.year as string, 10);
    const month = parseInt(params.month as string, 10);
    const day = parseInt(params.day as string, 10);

    // Validate date components
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return null;
    }

    // Validate ranges
    if (year < 2020 || year > 2100) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    // Create date (month is 0-indexed in JS)
    const date = new Date(year, month - 1, day);

    // Verify the date is valid (handles invalid dates like Feb 30)
    if (date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day) {
      return null;
    }

    return date;
  }, [params.year, params.month, params.day]);

  // Show 404 for invalid dates
  if (!date) {
    notFound();
  }

  return <ScreenDisplay date={date} />;
}
