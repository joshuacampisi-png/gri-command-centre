import { env } from '../lib/env.js'

export async function getOpenClawSnapshot() {
  return {
    connected: Boolean(env.openclaw.gatewayUrl),
    gatewayUrl: env.openclaw.gatewayUrl,
    agents: [
      { id: 'main', name: 'Pablo Escobot', role: 'Master Agent', status: 'Online' },
      { id: 'shopify-dev', name: 'Shopify Web Developer', role: 'Theme code specialist', status: 'Active' },
      { id: 'ops-manager', name: 'Operations Manager', role: 'Ops coordination', status: 'Waiting' },
      { id: 'analyst', name: 'Analyst', role: 'Shopify data intelligence', status: 'Review' }
    ],
    source: 'openclaw-stub'
  }
}
