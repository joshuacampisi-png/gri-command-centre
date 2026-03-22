export function inferTaskRouting(prompt = '') {
  const p = String(prompt).toLowerCase()

  const isCreative = ['banner','creative','graphic','graphics','hero','image','imagery','asset','assets','promo visual','sale creative'].some(k => p.includes(k))
  const isShopify = ['shopify','theme','liquid','css','javascript','section','sections','product page','pdp','title','titles','bug','mobile','cart','checkout'].some(k => p.includes(k))

  let taskType = 'Ops'
  let executor = 'Ops Manager'
  let owner = 'ops-manager'
  let functionName = 'Ops'

  if (isCreative) {
    taskType = 'Creative'
    executor = 'Graphic Designer Agent'
    owner = 'graphic-designer'
    functionName = 'Web'
  } else if (['product page','pdp','title','titles','section','sections'].some(k => p.includes(k))) {
    taskType = 'Product Page'
    executor = 'Shopify Dev Agent'
    owner = 'shopify-dev'
    functionName = 'Web'
  } else if (['theme','liquid','css','javascript'].some(k => p.includes(k))) {
    taskType = 'Theme'
    executor = 'Shopify Dev Agent'
    owner = 'shopify-dev'
    functionName = 'Web'
  } else if (['bug','broken','issue','error'].some(k => p.includes(k))) {
    taskType = 'Bug'
    executor = 'Shopify Dev Agent'
    owner = 'shopify-dev'
    functionName = 'Web'
  } else if (['conversion','cta','funnel','trust','cro'].some(k => p.includes(k))) {
    taskType = 'CRO'
    executor = 'Shopify Dev Agent'
    owner = 'shopify-dev'
    functionName = 'Web'
  } else if (isShopify) {
    taskType = 'Theme'
    executor = 'Shopify Dev Agent'
    owner = 'shopify-dev'
    functionName = 'Web'
  }

  return {
    taskType,
    executor,
    owner,
    fn: functionName,
    executionStage: 'Backlog',
    prStatus: 'Not Started',
  }
}
