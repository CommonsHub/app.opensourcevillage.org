/**
 * GitHub Webhook Endpoint
 *
 * POST /api/webhook/github
 *
 * Handles GitHub push webhooks to auto-deploy on new commits.
 * Verifies the webhook secret, then runs:
 * 1. git pull origin main
 * 2. bun install
 * 3. Restarts the systemd service
 *
 * Environment Variables:
 * - WEBHOOK_SECRET: GitHub webhook secret for signature verification
 * - SERVICE_NAME: Name of the systemd service to restart (default: osv)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Verify GitHub webhook signature
 */
function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) {
    return false;
  }

  const expectedSignature = 'sha256=' + createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  if (signature.length !== expectedSignature.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Execute a shell command and return output
 */
async function runCommand(command: string, cwd: string): Promise<{ stdout: string; stderr: string }> {
  console.log(`[Webhook] Running: ${command}`);
  try {
    const result = await execAsync(command, { cwd, timeout: 120000 }); // 2 minute timeout
    console.log(`[Webhook] Output: ${result.stdout}`);
    if (result.stderr) {
      console.log(`[Webhook] Stderr: ${result.stderr}`);
    }
    return result;
  } catch (error: any) {
    console.error(`[Webhook] Command failed: ${error.message}`);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  console.log('[Webhook] Received GitHub webhook');

  const secret = process.env.WEBHOOK_SECRET;

  if (!secret) {
    console.error('[Webhook] WEBHOOK_SECRET not configured');
    return NextResponse.json(
      { success: false, error: 'Webhook not configured' },
      { status: 500 }
    );
  }

  // Get the raw body for signature verification
  const payload = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  // Verify signature
  if (!verifySignature(payload, signature, secret)) {
    console.error('[Webhook] Invalid signature');
    return NextResponse.json(
      { success: false, error: 'Invalid signature' },
      { status: 401 }
    );
  }

  // Parse the payload
  let body: any;
  try {
    body = JSON.parse(payload);
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  // Only process push events to main branch
  const event = request.headers.get('x-github-event');
  console.log(`[Webhook] Event type: ${event}`);

  if (event !== 'push') {
    console.log(`[Webhook] Ignoring non-push event: ${event}`);
    return NextResponse.json({
      success: true,
      message: `Ignored event: ${event}`,
    });
  }

  const ref = body.ref;
  if (ref !== 'refs/heads/main') {
    console.log(`[Webhook] Ignoring push to non-main branch: ${ref}`);
    return NextResponse.json({
      success: true,
      message: `Ignored push to: ${ref}`,
    });
  }

  const pusher = body.pusher?.name || 'unknown';
  const commits = body.commits?.length || 0;
  console.log(`[Webhook] Processing push from ${pusher} with ${commits} commit(s)`);

  // Run deployment commands
  const cwd = process.cwd();
  const serviceName = process.env.SERVICE_NAME || 'osv';
  const results: string[] = [];

  try {
    // 1. Git pull
    console.log('[Webhook] Step 1: git pull origin main');
    const pullResult = await runCommand('git pull origin main', cwd);
    results.push(`git pull: ${pullResult.stdout.trim()}`);

    // Check if there were actual changes
    if (pullResult.stdout.includes('Already up to date')) {
      console.log('[Webhook] No changes to deploy');
      return NextResponse.json({
        success: true,
        message: 'Already up to date',
        results,
      });
    }

    // 2. Install dependencies
    console.log('[Webhook] Step 2: bun install');
    const installResult = await runCommand('bun install', cwd);
    results.push(`bun install: completed`);

    // 3. Build the application
    console.log('[Webhook] Step 3: bun run build');
    const buildResult = await runCommand('bun run build', cwd);
    results.push(`build: completed`);

    // 4. Restart all systemd services
    const services = [
      serviceName,
      `${serviceName}-payment-processor`,
      `${serviceName}-nostr-recorder`,
    ];

    console.log(`[Webhook] Step 4: Restarting services...`);
    for (const service of services) {
      try {
        await runCommand(`sudo systemctl restart ${service}`, cwd);
        results.push(`restart ${service}: completed`);
        console.log(`[Webhook] Restarted ${service}`);
      } catch (restartError: any) {
        // Service restart might fail if not configured, log but don't fail
        console.warn(`[Webhook] Service ${service} restart failed: ${restartError.message}`);
        results.push(`restart ${service}: failed (${restartError.message})`);
      }
    }

    console.log('[Webhook] Deployment completed successfully');

    return NextResponse.json({
      success: true,
      message: 'Deployment completed',
      pusher,
      commits,
      results,
    });

  } catch (error: any) {
    console.error('[Webhook] Deployment failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Deployment failed',
        results,
      },
      { status: 500 }
    );
  }
}

// Also handle GET for health checks
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'GitHub webhook endpoint is active',
    configured: !!process.env.WEBHOOK_SECRET,
  });
}
