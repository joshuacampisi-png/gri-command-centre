/**
 * Update the trust-badge JS — rewrite copy in Google's voice (third-person authority)
 * Only touches assets/gri-google-trust-badge.js, nothing else
 */
import 'dotenv/config'
import { readFileSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const log = JSON.parse(readFileSync('data/snapshots/google-trust-badge/log.json','utf8'))
const themeId = log.themeId
const badgeUrl = log.badgeUrl

const JS = `/* GRI Google Trust Badge — Google-voice copy */
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

  // ===== Popup — Google-voice copy =====
  var popup = el('div', { class:'gri-gtb-popup', role:'dialog', 'aria-label':'Google verified business details' });
  popup.innerHTML = ''
    + '<button class="gri-gtb-popup-close" type="button" aria-label="Close">\\u00d7</button>'
    + '<div class="gri-gtb-popup-header">'
    +   '<img src="' + BADGE_IMG + '" alt="Voted by Google" />'
    +   '<div class="gri-gtb-title">Verified by Google<small>2026 Top Retailer \\u00b7 Australia</small></div>'
    + '</div>'
    + '<div class="gri-gtb-stars">\\u2605\\u2605\\u2605\\u2605\\u2605 <span>4.85 \\u00b7 7,350 Google reviews</span></div>'
    + '<p class="gri-gtb-headline">Australia\\'s 2026 top gender reveal retailer</p>'
    + '<p class="gri-gtb-body">Based on verified reviews, customer feedback and business operations, <strong>Gender Reveal Ideas</strong> has been selected as Australia\\'s top gender reveal retailer for 2026. The Gold Coast-based business holds a <strong>4.85-star rating from 7,350 verified reviews</strong>, has served over <strong>70,000 Australian families</strong>, and has been featured by ABC News, Sunrise and 9News.</p>'
    + '<div class="gri-gtb-links">'
    +   '<a href="' + SHOP_LINK + '" target="_blank" rel="noopener nofollow">See their Google business profile</a>'
    +   '<a href="' + INFO_LINK + '" target="_blank" rel="noopener nofollow">How Google verifies reviews</a>'
    + '</div>'
    + '<div class="gri-gtb-footer">Independent ratings based on Google review data</div>';

  popup.querySelector('.gri-gtb-popup-close').addEventListener('click', function(){
    popup.classList.remove('open');
  });
  badge.addEventListener('click', function(){
    popup.classList.toggle('open');
  });
  document.addEventListener('click', function(ev){
    if (!popup.classList.contains('open')) return;
    if (popup.contains(ev.target) || badge.contains(ev.target)) return;
    popup.classList.remove('open');
  });

  function mount(){
    document.body.appendChild(badge);
    document.body.appendChild(popup);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else { mount(); }
})();
`

const r = await rest(`/themes/${themeId}/assets.json`, {
  method: 'PUT',
  body: JSON.stringify({ asset: { key: 'assets/gri-google-trust-badge.js', value: JS } })
})

if (r.errors) {
  console.error('Update failed:', r.errors)
  process.exit(1)
}
console.log('✓ Copy updated to Google voice')
console.log('Asset:', r.asset?.public_url || r.asset?.key)
process.exit(0)
