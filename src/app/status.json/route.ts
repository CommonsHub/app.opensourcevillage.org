/**
 * Status JSON Route
 *
 * GET /status.json
 * Proxies to /api/status for convenience
 */

import { GET as getStatus } from '../api/status/route';

export async function GET() {
  return getStatus();
}
