/**
 * Optional smoke checks after deploy. Does not run flows.
 *
 * Usage:
 *   WORKER_URL=https://your-worker.example.com node scripts/smoke-rollout.mjs
 *   APP_URL=https://your-app.vercel.app CRON_SECRET=xxx node scripts/smoke-rollout.mjs
 */

const workerUrl = process.env.WORKER_URL?.replace(/\/$/, '');
const appUrl = process.env.APP_URL?.replace(/\/$/, '');
const cronSecret = process.env.CRON_SECRET;

async function main() {
  let failed = false;

  if (workerUrl) {
    const healthUrl = `${workerUrl}/health`;
    try {
      const r = await fetch(healthUrl, { signal: AbortSignal.timeout(15000) });
      const text = await r.text();
      if (!r.ok) {
        console.error(`[FAIL] Worker health ${healthUrl} -> ${r.status} ${text}`);
        failed = true;
      } else {
        console.log(`[OK]   Worker health ${healthUrl} -> ${r.status} ${text}`);
      }
    } catch (e) {
      console.error(`[FAIL] Worker health fetch:`, e?.message || e);
      failed = true;
    }
  } else {
    console.log('[SKIP] WORKER_URL not set; skipping worker /health');
  }

  if (appUrl) {
    try {
      const r = await fetch(`${appUrl}/`, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
      if (!r.ok) {
        console.error(`[FAIL] App root ${appUrl}/ -> ${r.status}`);
        failed = true;
      } else {
        console.log(`[OK]   App root ${appUrl}/ -> ${r.status}`);
      }
    } catch (e) {
      console.error(`[FAIL] App root fetch:`, e?.message || e);
      failed = true;
    }
  } else {
    console.log('[SKIP] APP_URL not set; skipping app root');
  }

  if (appUrl && cronSecret) {
    try {
      const r = await fetch(`${appUrl}/api/cron/dispatch`, {
        headers: { Authorization: `Bearer ${cronSecret}` },
        signal: AbortSignal.timeout(30000),
      });
      const text = await r.text();
      if (!r.ok) {
        console.error(`[FAIL] Cron dispatch -> ${r.status} ${text}`);
        failed = true;
      } else {
        console.log(`[OK]   Cron dispatch -> ${r.status} ${text}`);
      }
    } catch (e) {
      console.error(`[FAIL] Cron dispatch fetch:`, e?.message || e);
      failed = true;
    }
  } else {
    console.log('[SKIP] APP_URL and CRON_SECRET both required for cron check');
  }

  if (failed) process.exit(1);
  console.log('\nSmoke checks finished.');
}

main();
