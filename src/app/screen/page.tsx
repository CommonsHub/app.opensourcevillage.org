/**
 * TV Screen Display - Today's schedule
 * Route: /screen
 */

'use client';

import { useMemo } from 'react';
import ScreenDisplay from '@/components/ScreenDisplay';

export default function ScreenPage() {
  // Get today's date
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  return <ScreenDisplay date={today} />;
}
