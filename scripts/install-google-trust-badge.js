/**
 * INSTALL "VOTED AUSTRALIA'S BEST BY GOOGLE" TRUST BADGE
 *
 * Sticky bottom-LEFT badge with X-to-dismiss. Click → popup info card with
 * 2 Google legitimacy links.
 *
 * - Uploads circular logo (transparent corners) to Shopify Files
 * - Writes assets/gri-google-trust-badge.js + .css into published theme
 * - Injects script + style references into theme.liquid before </body>
 *
 * Rollback: --rollback removes both assets + theme.liquid injection
 */
import 'dotenv/config'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const GQL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'

async function gql(q,v={}){const r=await fetch(GQL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const SNAPSHOT_DIR = 'data/snapshots/google-trust-badge'
mkdirSync(SNAPSHOT_DIR, { recursive: true })
const LOG = `${SNAPSHOT_DIR}/log.json`

const ROLLBACK = process.argv.includes('--rollback')

console.log(`\n=== ${ROLLBACK?'ROLLBACK':'INSTALL'} — Google Trust Badge Widget ===\n`)

// ============ 1. UPLOAD LOGO ============
let badgeUrl = null
if (!ROLLBACK) {
  console.log('Step 1/4: Uploading circular badge image to Shopify Files...')
  const buf = readFileSync('/tmp/google_badge_circle.png')
  const filename = 'google_trust_badge_circle.png'

  const sq = await gql(`mutation($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}}}}`, {
    input:[{filename, mimeType:'image/png', httpMethod:'POST', resource:'FILE', fileSize:String(buf.length)}]
  })
  const target = sq.data?.stagedUploadsCreate?.stagedTargets?.[0]
  const fd = new FormData()
  for (const p of target.parameters) fd.append(p.name, p.value)
  fd.append('file', new Blob([buf], { type: 'image/png' }), filename)
  await fetch(target.url, { method: 'POST', body: fd })
  const fc = await gql(`mutation($files:[FileCreateInput!]!){fileCreate(files:$files){files{id ... on MediaImage{image{url} fileStatus}}}}`, {
    files:[{originalSource: target.resourceUrl, alt:'Voted Australia\'s Best By Google — gender reveal retailer', contentType:'IMAGE'}]
  })
  const fileId = fc.data?.fileCreate?.files?.[0]?.id
  for (let i = 0; i < 12; i++) {
    await new Promise(r=>setTimeout(r, 1500))
    const q = await gql(`query($id:ID!){node(id:$id){... on MediaImage{image{url} fileStatus}}}`, { id: fileId })
    if (q.data?.node?.fileStatus === 'READY') { badgeUrl = q.data.node.image.url; break }
  }
  console.log(`  ✓ ${badgeUrl}`)
}

// ============ 2. GET PUBLISHED THEME ============
console.log(`\nStep 2/4: Locating published theme...`)
const themes = await rest('/themes.json')
const theme = themes.themes?.find(t => t.role === 'main')
if (!theme) { console.error('No published theme found'); process.exit(1) }
console.log(`  ✓ Theme: ${theme.name} (id: ${theme.id})`)

// ============ ASSET HELPERS ============
async function getAsset(key) {
  const r = await rest(`/themes/${theme.id}/assets.json?asset[key]=${encodeURIComponent(key)}`)
  return r.asset
}
async function putAsset(key, value) {
  return rest(`/themes/${theme.id}/assets.json`, {
    method: 'PUT',
    body: JSON.stringify({ asset: { key, value } })
  })
}
async function deleteAsset(key) {
  return rest(`/themes/${theme.id}/assets.json?asset[key]=${encodeURIComponent(key)}`, { method: 'DELETE' })
}

// ============ 3. WIDGET FILES ============
const CSS_KEY = 'assets/gri-google-trust-badge.css'
const JS_KEY  = 'assets/gri-google-trust-badge.js'
const THEME_KEY = 'layout/theme.liquid'
const INJECT_MARKER_START = '<!-- GRI-GOOGLE-TRUST-BADGE-START -->'
const INJECT_MARKER_END   = '<!-- GRI-GOOGLE-TRUST-BADGE-END -->'

if (ROLLBACK) {
  console.log(`\nRolling back...`)
  // Restore theme.liquid from snapshot
  if (existsSync(LOG)) {
    const log = JSON.parse(readFileSync(LOG,'utf8'))
    if (log.originalThemeLiquid) {
      await putAsset(THEME_KEY, log.originalThemeLiquid)
      console.log(`  ✓ Restored theme.liquid`)
    }
  }
  // Delete assets
  await deleteAsset(CSS_KEY).catch(()=>{})
  console.log(`  ✓ Deleted ${CSS_KEY}`)
  await deleteAsset(JS_KEY).catch(()=>{})
  console.log(`  ✓ Deleted ${JS_KEY}`)
  console.log(`\nRollback complete`)
  process.exit(0)
}

// ============ CSS ============
const CSS = `/* GRI Google Trust Badge */
.gri-gtb-badge,
.gri-gtb-popup{
  position:fixed;
  z-index:9998;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
}
.gri-gtb-badge{
  bottom:24px;
  left:24px;
  width:86px;
  height:86px;
  cursor:pointer;
  transition:transform .25s ease,box-shadow .25s ease;
  animation:gri-gtb-pop .5s cubic-bezier(.22,1.2,.36,1) .8s both;
  border-radius:50%;
  background:#fff;
  box-shadow:0 6px 24px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.06);
}
.gri-gtb-badge:hover{transform:scale(1.06);box-shadow:0 10px 32px rgba(0,0,0,.22),0 4px 12px rgba(0,0,0,.08)}
.gri-gtb-badge img{
  width:100%;
  height:100%;
  border-radius:50%;
  display:block;
  pointer-events:none;
}
.gri-gtb-badge .gri-gtb-close{
  position:absolute;
  top:-4px;
  right:-4px;
  width:22px;
  height:22px;
  background:#fff;
  color:#666;
  border:1px solid #e6e6e6;
  border-radius:50%;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:14px;
  font-weight:700;
  line-height:1;
  cursor:pointer;
  box-shadow:0 2px 6px rgba(0,0,0,.12);
  transition:background .15s ease,color .15s ease;
}
.gri-gtb-badge .gri-gtb-close:hover{background:#f5f5f5;color:#000}

.gri-gtb-popup{
  bottom:24px;
  left:24px;
  width:330px;
  max-width:calc(100vw - 32px);
  background:#fff;
  border-radius:16px;
  box-shadow:0 12px 40px rgba(0,0,0,.20),0 4px 16px rgba(0,0,0,.08);
  border:1px solid #ececec;
  padding:18px 18px 16px;
  display:none;
  animation:gri-gtb-slide-up .25s cubic-bezier(.22,1.2,.36,1) both;
}
.gri-gtb-popup.open{display:block}
.gri-gtb-popup-header{
  display:flex;
  align-items:center;
  gap:10px;
  margin-bottom:10px;
}
.gri-gtb-popup-header img{width:36px;height:36px;border-radius:50%;flex-shrink:0}
.gri-gtb-popup-header .gri-gtb-title{
  font-size:13px;
  font-weight:600;
  color:#222;
  line-height:1.3;
}
.gri-gtb-popup-header .gri-gtb-title small{
  display:block;
  font-size:11px;
  color:#777;
  font-weight:500;
  margin-top:2px;
}
.gri-gtb-popup .gri-gtb-popup-close{
  position:absolute;
  top:10px;
  right:10px;
  width:24px;
  height:24px;
  border:none;
  background:transparent;
  font-size:18px;
  color:#999;
  cursor:pointer;
  line-height:1;
  padding:0;
  border-radius:50%;
  display:flex;
  align-items:center;
  justify-content:center;
}
.gri-gtb-popup .gri-gtb-popup-close:hover{background:#f3f3f3;color:#000}
.gri-gtb-popup .gri-gtb-headline{
  font-size:15px;
  font-weight:700;
  color:#111;
  margin:8px 0 6px;
  line-height:1.35;
}
.gri-gtb-popup .gri-gtb-body{
  font-size:13px;
  color:#555;
  line-height:1.55;
  margin:0 0 12px;
}
.gri-gtb-popup .gri-gtb-stars{
  color:#fbbc04;
  font-size:13px;
  letter-spacing:1px;
  margin-bottom:10px;
}
.gri-gtb-popup .gri-gtb-stars span{font-size:12px;color:#555;margin-left:6px;letter-spacing:0;font-weight:600}
.gri-gtb-popup .gri-gtb-links{
  display:flex;
  flex-direction:column;
  gap:8px;
  padding-top:10px;
  border-top:1px solid #f0f0f0;
}
.gri-gtb-popup .gri-gtb-links a{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding:10px 12px;
  background:#f7f8fa;
  border:1px solid #ececec;
  border-radius:10px;
  color:#1a73e8;
  text-decoration:none;
  font-size:13px;
  font-weight:600;
  transition:background .15s ease,border-color .15s ease;
}
.gri-gtb-popup .gri-gtb-links a:hover{background:#eaf2fe;border-color:#cfe1fb}
.gri-gtb-popup .gri-gtb-links a::after{content:'\\2192';color:#1a73e8;font-weight:700}
.gri-gtb-popup .gri-gtb-footer{
  margin-top:12px;
  padding-top:10px;
  border-top:1px solid #f0f0f0;
  font-size:10px;
  color:#999;
  text-align:center;
  line-height:1.4;
}

@keyframes gri-gtb-pop{
  0%{transform:scale(0);opacity:0}
  60%{transform:scale(1.08);opacity:1}
  100%{transform:scale(1);opacity:1}
}
@keyframes gri-gtb-slide-up{
  0%{transform:translateY(12px);opacity:0}
  100%{transform:translateY(0);opacity:1}
}

@media (max-width:600px){
  .gri-gtb-badge{width:72px;height:72px;bottom:18px;left:18px}
  .gri-gtb-popup{bottom:18px;left:18px;right:18px;width:auto}
}

.gri-gtb-hidden{display:none !important}
`

// ============ JS ============
const JS = `/* GRI Google Trust Badge — sticky bottom-left + popup */
(function(){
  if (window.__griGtbInit) return;
  window.__griGtbInit = true;

  var BADGE_IMG = ${JSON.stringify(badgeUrl)};
  var SHOP_LINK = 'https://www.google.com/search?q=Gender+Reveal+Ideas+Australia';
  var INFO_LINK = 'https://support.google.com/business/answer/7035772?hl=en';

  var DISMISS_KEY = 'gri_gtb_dismissed_v1';
  if (sessionStorage.getItem(DISMISS_KEY) === '1') return;

  function el(tag, attrs, html){
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  }

  // ===== Badge =====
  var badge = el('div', { class:'gri-gtb-badge', role:'button', 'aria-label':'Voted Australia\\'s Best By Google — click for details' });
  var img = el('img', { src: BADGE_IMG, alt:'Voted Australia\\'s Best By Google', loading:'eager' });
  badge.appendChild(img);
  var closeBtn = el('button', { class:'gri-gtb-close', type:'button', 'aria-label':'Dismiss badge' }, '\\u00d7');
  closeBtn.addEventListener('click', function(ev){
    ev.stopPropagation();
    sessionStorage.setItem(DISMISS_KEY, '1');
    badge.classList.add('gri-gtb-hidden');
    popup.classList.add('gri-gtb-hidden');
  });
  badge.appendChild(closeBtn);

  // ===== Popup =====
  var popup = el('div', { class:'gri-gtb-popup', role:'dialog', 'aria-label':'Google trust badge details' });
  popup.innerHTML = ''
    + '<button class="gri-gtb-popup-close" type="button" aria-label="Close">\\u00d7</button>'
    + '<div class="gri-gtb-popup-header">'
    +   '<img src="' + BADGE_IMG + '" alt="Voted by Google" />'
    +   '<div class="gri-gtb-title">Voted Australia\\'s Best By Google<small>Verified business · 4.85★ rated</small></div>'
    + '</div>'
    + '<div class="gri-gtb-stars">\\u2605\\u2605\\u2605\\u2605\\u2605 <span>1,360+ verified reviews</span></div>'
    + '<p class="gri-gtb-headline">Why Aussie families pick us as #1</p>'
    + '<p class="gri-gtb-body">Gender Reveal Ideas has been voted Australia\\'s #1 gender reveal retailer by Google reviews. 70,000+ happy Aussie families, 4.85 stars from 1,360+ verified reviews, featured on ABC, Sunrise and 9News. Custom-made on the Gold Coast with free express shipping Australia-wide.</p>'
    + '<div class="gri-gtb-links">'
    +   '<a href="' + SHOP_LINK + '" target="_blank" rel="noopener nofollow">See our Google business profile</a>'
    +   '<a href="' + INFO_LINK + '" target="_blank" rel="noopener nofollow">About Google reviews</a>'
    + '</div>'
    + '<div class="gri-gtb-footer">Independently rated · Google reviews policy</div>';

  popup.querySelector('.gri-gtb-popup-close').addEventListener('click', function(){
    popup.classList.remove('open');
  });

  badge.addEventListener('click', function(){
    popup.classList.toggle('open');
  });

  // Close popup on outside click
  document.addEventListener('click', function(ev){
    if (!popup.classList.contains('open')) return;
    if (popup.contains(ev.target) || badge.contains(ev.target)) return;
    popup.classList.remove('open');
  });

  // Insert
  function mount(){
    document.body.appendChild(badge);
    document.body.appendChild(popup);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else { mount(); }
})();
`

// ============ 4. UPLOAD ASSETS + INJECT ============
console.log(`\nStep 3/4: Writing assets to theme...`)
const cssResp = await putAsset(CSS_KEY, CSS)
if (cssResp.errors) { console.error('CSS asset error:', cssResp.errors); process.exit(1) }
console.log(`  ✓ ${CSS_KEY}`)
const jsResp  = await putAsset(JS_KEY,  JS)
if (jsResp.errors) { console.error('JS asset error:', jsResp.errors); process.exit(1) }
console.log(`  ✓ ${JS_KEY}`)

console.log(`\nStep 4/4: Injecting into theme.liquid before </body>...`)
const themeLiquid = await getAsset(THEME_KEY)
if (!themeLiquid?.value) { console.error('Could not read theme.liquid'); process.exit(1) }

const original = themeLiquid.value
const log = { installedAt:new Date().toISOString(), badgeUrl, themeId: theme.id, originalThemeLiquid: original }
writeFileSync(LOG, JSON.stringify(log, null, 2))
console.log(`  ✓ Snapshot saved: ${LOG}`)

let body = original
// Remove any prior injection
const re = new RegExp(INJECT_MARKER_START + '[\\\\s\\\\S]*?' + INJECT_MARKER_END, 'g')
body = body.replace(re, '')

const injection = `
${INJECT_MARKER_START}
{{ 'gri-google-trust-badge.css' | asset_url | stylesheet_tag }}
<script src="{{ 'gri-google-trust-badge.js' | asset_url }}" defer></script>
${INJECT_MARKER_END}
`

if (body.includes('</body>')) {
  body = body.replace('</body>', injection + '\n</body>')
} else {
  body += injection
}

const upd = await putAsset(THEME_KEY, body)
if (upd.errors) { console.error('theme.liquid update error:', upd.errors); process.exit(1) }
console.log(`  ✓ theme.liquid updated`)

console.log(`\n✓ INSTALL COMPLETE`)
console.log(`Badge URL: ${badgeUrl}`)
console.log(`Live on: https://genderrevealideas.com.au (every page, bottom-left)`)
console.log(`Rollback: node scripts/install-google-trust-badge.js --rollback`)
process.exit(0)
