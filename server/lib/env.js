import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

import { existsSync } from 'fs'
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../../.env')
if (existsSync(envPath)) dotenv.config({ path: envPath })

export const env = {
  port: Number(process.env.PORT || 8787),
  notion: {
    token: process.env.NOTION_TOKEN || '',
    tasksDb: process.env.NOTION_TASKS_DB || '',
    findingsDb: process.env.NOTION_FINDINGS_DB || '',
    reportsDb: process.env.NOTION_REPORTS_DB || '',
    sopsDb: process.env.NOTION_SOPS_DB || '',
    approvalsDb: process.env.NOTION_APPROVALS_DB || '',
  },
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN || '',
    signingSecret: process.env.SLACK_SIGNING_SECRET || '',
    channels: {
      command: process.env.SLACK_CHANNEL_COMMAND || '',
      webdev: process.env.SLACK_CHANNEL_WEBDEV || '',
      ops: process.env.SLACK_CHANNEL_OPS || '',
      analyst: process.env.SLACK_CHANNEL_ANALYST || '',
      handoffs: process.env.SLACK_CHANNEL_HANDOFFS || '',
      alerts: process.env.SLACK_CHANNEL_ALERTS || '',
    }
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL || '',
    joshChatId: process.env.TELEGRAM_JOSH_CHAT_ID || '8040702286',
  },
  openclaw: {
    gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789',
    gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN || '',
  },
  shopify: {
    storeDomain: process.env.SHOPIFY_STORE_DOMAIN || '',
    adminAccessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '',
    clientId: process.env.SHOPIFY_CLIENT_ID || '',
    clientSecret: process.env.SHOPIFY_API_SECRET || '',
    storefrontAccessToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || '',
    apiKey: process.env.SHOPIFY_API_KEY || '',
    apiSecret: process.env.SHOPIFY_API_SECRET || '',
    appUrl: process.env.SHOPIFY_APP_URL || `http://127.0.0.1:${Number(process.env.PORT || 8787)}`,
    scopes: process.env.SHOPIFY_SCOPES || 'read_themes,write_themes',
    liveThemeId: process.env.SHOPIFY_LIVE_THEME_ID || '',
    previewThemeId: process.env.SHOPIFY_PREVIEW_THEME_ID || '',
  },
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  dataForSEO: {
    email: process.env.DATAFORSEO_EMAIL || '',
    password: process.env.DATAFORSEO_PASSWORD || '',
    auth: process.env.DATAFORSEO_AUTH || '',
  },
  googleSearchConsole: {
    credentials: process.env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS || '',
    credentialsPath: process.env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS_PATH || '',
    siteUrlGri: process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL_GRI || 'https://genderrevealideas.com.au',
    siteUrlLionzen: process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL_LIONZEN || 'https://lionzen.com.au'
  },
}

export function integrationStatus() {
  return {
    notion: Boolean(env.notion.token),
    slack: Boolean(env.slack.botToken),
    telegram: Boolean(env.telegram.botToken),
    openclaw: Boolean(env.openclaw.gatewayUrl),
    shopify: Boolean(env.shopify.storeDomain && env.shopify.adminAccessToken),
    anthropic: Boolean(env.anthropicApiKey),
    googleSearchConsole: Boolean(env.googleSearchConsole.credentials || env.googleSearchConsole.credentialsPath),
  }
}
