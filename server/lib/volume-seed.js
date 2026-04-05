/**
 * volume-seed.js
 *
 * Railway persistent-volume seeding.
 *
 * THE PROBLEM
 * ----------
 * `server/lib/data-dir.js` prefers `RAILWAY_VOLUME_MOUNT_PATH` over the
 * committed `data/` folder on Railway. That is normally correct — the volume
 * survives deploys and captures real-time webhook writes. But any NEW data
 * file we commit into `data/` (e.g. a freshly-bootstrapped customer index)
 * lands inside the container image at `/app/data/...` and is NEVER copied
 * into the volume, so the server silently runs with an empty / near-empty
 * baseline until something re-populates the volume file by other means.
 *
 * On 2026-04-05 this bit us: the committed customer-index.json had 864
 * entries, Railway's volume had 12, the dashboard reported CM$ -$10,976 RED
 * when the real number was +$9,300 GREEN.
 *
 * THE FIX
 * -------
 * On every server boot, for each whitelisted file:
 *   - If the volume copy is missing → copy the committed file in
 *   - If the volume copy is strictly SMALLER than the committed file →
 *     copy the committed file in (volume has been reset or never seeded)
 *   - If the volume copy is equal or larger → keep it (it has grown via
 *     webhooks beyond the baseline we shipped — don't clobber)
 *
 * Size-based heuristic is deliberately simple and safe:
 *   - It never deletes
 *   - It only overwrites when the volume has LESS data than the baseline
 *   - Any webhooks received after seeding will still be appended
 *
 * LOCAL DEV
 * ---------
 * No-op when RAILWAY_VOLUME_MOUNT_PATH is unset.
 */

import { existsSync, statSync, copyFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

// Files that should be seeded from the committed repo snapshot into the
// Railway volume on boot. Keep this list small — only files where the
// committed snapshot is meaningfully better than an empty volume.
const SEED_WHITELIST = [
  'flywheel/customer-index.json',
]

export function seedVolumeFromRepo() {
  const volumeRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH
  if (!volumeRoot) {
    return { ok: true, skipped: 'no-volume-env', note: 'local dev — nothing to seed' }
  }

  const repoDataRoot = join(process.cwd(), 'data')
  if (!existsSync(repoDataRoot)) {
    console.warn('[VolumeSeed] Repo data root missing:', repoDataRoot)
    return { ok: false, skipped: 'no-repo-data', repoDataRoot }
  }

  console.log(`[VolumeSeed] Volume=${volumeRoot}  Repo=${repoDataRoot}`)
  const results = []

  for (const relPath of SEED_WHITELIST) {
    const repoPath = join(repoDataRoot, relPath)
    const volumePath = join(volumeRoot, relPath)

    if (!existsSync(repoPath)) {
      results.push({ file: relPath, action: 'skipped', reason: 'repo-missing' })
      continue
    }

    const repoStat = statSync(repoPath)
    let action = 'copied'
    let reason = 'volume-missing'

    if (existsSync(volumePath)) {
      const volumeStat = statSync(volumePath)
      if (volumeStat.size >= repoStat.size) {
        results.push({
          file: relPath,
          action: 'kept',
          reason: 'volume-at-least-as-large',
          volumeSize: volumeStat.size,
          repoSize: repoStat.size,
        })
        continue
      }
      reason = `volume-smaller (${volumeStat.size} < ${repoStat.size})`
    }

    try {
      mkdirSync(dirname(volumePath), { recursive: true })
      copyFileSync(repoPath, volumePath)
      results.push({ file: relPath, action, reason, size: repoStat.size })
    } catch (err) {
      results.push({ file: relPath, action: 'error', error: err.message })
    }
  }

  for (const r of results) {
    const tag = r.action === 'error' ? '❌' : r.action === 'copied' ? '✅' : '·'
    console.log(`[VolumeSeed] ${tag} ${r.file}  ${r.action}  ${r.reason || ''}${r.size ? ` (${r.size}b)` : ''}`)
  }

  return { ok: true, volumeRoot, repoDataRoot, results }
}

/**
 * Force re-seed a specific whitelisted file, overwriting whatever is in the
 * volume. Use with care — intended for the `/api/ads/reseed-volume` endpoint
 * when you've pushed a new committed baseline and want it applied without a
 * full container restart.
 */
export function forceSeedFile(relPath) {
  if (!SEED_WHITELIST.includes(relPath)) {
    return { ok: false, error: `File "${relPath}" is not in the seed whitelist` }
  }

  const volumeRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH
  if (!volumeRoot) {
    return { ok: false, error: 'RAILWAY_VOLUME_MOUNT_PATH not set — nothing to seed into' }
  }

  const repoPath = join(process.cwd(), 'data', relPath)
  const volumePath = join(volumeRoot, relPath)

  if (!existsSync(repoPath)) {
    return { ok: false, error: `Repo file missing: ${repoPath}` }
  }

  try {
    mkdirSync(dirname(volumePath), { recursive: true })
    copyFileSync(repoPath, volumePath)
    const size = statSync(volumePath).size
    console.log(`[VolumeSeed] Force-seeded ${relPath} (${size}b)`)
    return { ok: true, file: relPath, size }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export function getSeedWhitelist() {
  return [...SEED_WHITELIST]
}
