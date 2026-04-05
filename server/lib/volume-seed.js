/**
 * volume-seed.js
 *
 * Railway persistent-volume seeding.
 *
 * THE PROBLEM
 * ----------
 * `server/lib/data-dir.js` prefers `RAILWAY_VOLUME_MOUNT_PATH` over the
 * committed `data/` folder on Railway. On GRI's Railway service the volume
 * is mounted AT `/app/data/` — which means the Docker image's own
 * `/app/data/` (containing any files we committed in the repo's `data/`
 * folder) is COMPLETELY SHADOWED by the volume mount at runtime. The
 * committed baseline files never exist on the live filesystem.
 *
 * On 2026-04-05 this bit us: the committed customer-index.json had 864
 * entries, Railway's volume had 12, the dashboard reported CM$ -$10,976 RED
 * when the real number was +$9,300 GREEN.
 *
 * THE FIX
 * -------
 * Baseline files live in `seed-data/` at the repo root — OUTSIDE the volume
 * mount path, so they remain accessible inside the container at
 * `/app/seed-data/...` even when the volume shadows `/app/data/`.
 *
 * On every server boot, for each whitelisted file, copy from
 * `seed-data/<file>` → `<volume>/<file>` when:
 *   - The volume copy is missing, OR
 *   - The volume copy is strictly SMALLER than the seed copy (volume has
 *     been reset, partially restored, or never seeded).
 * If the volume copy is equal or larger, keep it — webhooks have grown it
 * beyond the baseline we shipped and we must not clobber them.
 *
 * Size-based heuristic is deliberately simple and safe:
 *   - Never deletes
 *   - Only overwrites when the volume has LESS data than the baseline
 *   - Any webhooks received after seeding will still be appended
 *
 * HOW TO SHIP A NEW BASELINE
 * --------------------------
 *   1. cp data/<file> seed-data/<file>
 *   2. commit + push
 *   3. Railway redeploys, boot seed detects volume < seed, overwrites.
 *      (Or hit POST /api/ads/force-seed-file to apply without restart.)
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

  const seedRoot = join(process.cwd(), 'seed-data')
  if (!existsSync(seedRoot)) {
    console.warn('[VolumeSeed] seed-data/ root missing:', seedRoot)
    return { ok: false, skipped: 'no-seed-data', seedRoot }
  }

  if (seedRoot === volumeRoot) {
    console.warn('[VolumeSeed] seedRoot === volumeRoot — seed would be a no-op against itself')
    return { ok: false, skipped: 'seed-equals-volume', seedRoot, volumeRoot }
  }

  console.log(`[VolumeSeed] Volume=${volumeRoot}  Seed=${seedRoot}`)
  const results = []

  for (const relPath of SEED_WHITELIST) {
    const seedPath = join(seedRoot, relPath)
    const volumePath = join(volumeRoot, relPath)

    if (!existsSync(seedPath)) {
      results.push({ file: relPath, action: 'skipped', reason: 'seed-missing' })
      continue
    }

    const repoStat = statSync(seedPath)
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
      copyFileSync(seedPath, volumePath)
      results.push({ file: relPath, action, reason, size: repoStat.size })
    } catch (err) {
      results.push({ file: relPath, action: 'error', error: err.message })
    }
  }

  for (const r of results) {
    const tag = r.action === 'error' ? '❌' : r.action === 'copied' ? '✅' : '·'
    console.log(`[VolumeSeed] ${tag} ${r.file}  ${r.action}  ${r.reason || ''}${r.size ? ` (${r.size}b)` : ''}`)
  }

  return { ok: true, volumeRoot, seedRoot, results }
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

  const seedPath = join(process.cwd(), 'seed-data', relPath)
  const volumePath = join(volumeRoot, relPath)

  if (!existsSync(seedPath)) {
    return { ok: false, error: `Seed file missing: ${seedPath}` }
  }

  try {
    mkdirSync(dirname(volumePath), { recursive: true })
    copyFileSync(seedPath, volumePath)
    const size = statSync(volumePath).size
    console.log(`[VolumeSeed] Force-seeded ${relPath} from seed-data/ (${size}b)`)
    return { ok: true, file: relPath, size }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export function getSeedWhitelist() {
  return [...SEED_WHITELIST]
}
