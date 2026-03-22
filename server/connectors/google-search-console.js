/**
 * Google Search Console API Connector
 * 
 * Provides access to real SEO data:
 * - Keyword rankings
 * - Organic traffic (clicks, impressions)
 * - Click-through rates
 * - Average position
 * - Query performance over time
 */

import { google } from 'googleapis';
import { env } from '../lib/env.js';

let searchConsole = null;

/**
 * Initialize Google Search Console API client
 */
function initializeClient() {
  if (searchConsole) return searchConsole;

  try {
    // Option 1: Credentials from JSON string in .env
    if (env.googleSearchConsole?.credentials) {
      const credentials = JSON.parse(env.googleSearchConsole.credentials);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
      });
      searchConsole = google.webmasters({ version: 'v3', auth });
    }
    // Option 2: Credentials from JSON file path
    else if (env.googleSearchConsole?.credentialsPath) {
      const auth = new google.auth.GoogleAuth({
        keyFile: env.googleSearchConsole.credentialsPath,
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
      });
      searchConsole = google.webmasters({ version: 'v3', auth });
    }
    else {
      console.warn('⚠️ Google Search Console credentials not configured');
      return null;
    }

    console.log('✅ Google Search Console API initialized');
    return searchConsole;
  } catch (error) {
    console.error('❌ Failed to initialize Google Search Console API:', error.message);
    return null;
  }
}

/**
 * Test connection and get site summary
 */
export async function testConnection(siteUrl) {
  const client = initializeClient();
  if (!client) throw new Error('Google Search Console not configured');

  try {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const response = await client.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: []
      }
    });

    const data = response.data.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };

    return {
      status: 'connected',
      site: siteUrl,
      lastCrawl: endDate,
      totalClicks: data.clicks,
      totalImpressions: data.impressions,
      avgCTR: (data.ctr * 100).toFixed(2),
      avgPosition: data.position.toFixed(1)
    };
  } catch (error) {
    throw new Error(`Failed to query Search Console: ${error.message}`);
  }
}

/**
 * Get top pages by clicks
 */
export async function getTopPages(siteUrl, options = {}) {
  const client = initializeClient();
  if (!client) throw new Error('Google Search Console not configured');

  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate = new Date().toISOString().split('T')[0],
    limit = 100
  } = options;

  try {
    const response = await client.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['page'],
        rowLimit: limit,
        dimensionFilterGroups: []
      }
    });

    return (response.data.rows || []).map(row => ({
      url: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: (row.ctr * 100).toFixed(2),
      position: row.position.toFixed(1)
    }));
  } catch (error) {
    throw new Error(`Failed to get top pages: ${error.message}`);
  }
}

/**
 * Get top queries (keywords)
 */
export async function getTopQueries(siteUrl, options = {}) {
  const client = initializeClient();
  if (!client) throw new Error('Google Search Console not configured');

  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate = new Date().toISOString().split('T')[0],
    limit = 100
  } = options;

  try {
    const response = await client.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: limit
      }
    });

    return (response.data.rows || []).map(row => ({
      query: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: (row.ctr * 100).toFixed(2),
      position: row.position.toFixed(1)
    }));
  } catch (error) {
    throw new Error(`Failed to get top queries: ${error.message}`);
  }
}

/**
 * Get opportunities (high impressions, low CTR)
 */
export async function getOpportunities(siteUrl, options = {}) {
  const client = initializeClient();
  if (!client) throw new Error('Google Search Console not configured');

  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate = new Date().toISOString().split('T')[0],
    minImpressions = 100,
    maxCTR = 3.0 // 3% CTR threshold
  } = options;

  try {
    const response = await client.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['page', 'query'],
        rowLimit: 1000
      }
    });

    const opportunities = (response.data.rows || [])
      .filter(row => row.impressions >= minImpressions && row.ctr * 100 < maxCTR)
      .map(row => ({
        url: row.keys[0],
        query: row.keys[1],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: (row.ctr * 100).toFixed(2),
        position: row.position.toFixed(1),
        impactScore: calculateImpactScore(row)
      }))
      .sort((a, b) => b.impactScore - a.impactScore)
      .slice(0, 50);

    return opportunities;
  } catch (error) {
    throw new Error(`Failed to get opportunities: ${error.message}`);
  }
}

/**
 * Get near-miss rankings (positions 11-20)
 */
export async function getNearMisses(siteUrl, options = {}) {
  const client = initializeClient();
  if (!client) throw new Error('Google Search Console not configured');

  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate = new Date().toISOString().split('T')[0],
    minPosition = 11,
    maxPosition = 20
  } = options;

  try {
    const response = await client.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['page', 'query'],
        rowLimit: 1000
      }
    });

    const nearMisses = (response.data.rows || [])
      .filter(row => row.position >= minPosition && row.position <= maxPosition)
      .map(row => ({
        url: row.keys[0],
        query: row.keys[1],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: (row.ctr * 100).toFixed(2),
        position: row.position.toFixed(1),
        impactScore: calculateImpactScore(row)
      }))
      .sort((a, b) => b.impactScore - a.impactScore)
      .slice(0, 50);

    return nearMisses;
  } catch (error) {
    throw new Error(`Failed to get near-miss rankings: ${error.message}`);
  }
}

/**
 * Calculate impact score (1-10) based on impressions and position
 */
function calculateImpactScore(row) {
  const impressionScore = Math.min(row.impressions / 1000, 5); // Max 5 points
  const positionScore = Math.max(0, 5 - row.position / 4); // Max 5 points
  return Math.min(10, impressionScore + positionScore).toFixed(1);
}

/**
 * Get performance for a specific page
 */
export async function getPagePerformance(siteUrl, pageUrl, options = {}) {
  const client = initializeClient();
  if (!client) throw new Error('Google Search Console not configured');

  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate = new Date().toISOString().split('T')[0]
  } = options;

  try {
    const response = await client.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['query'],
        dimensionFilterGroups: [{
          filters: [{
            dimension: 'page',
            expression: pageUrl
          }]
        }],
        rowLimit: 100
      }
    });

    return (response.data.rows || []).map(row => ({
      query: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: (row.ctr * 100).toFixed(2),
      position: row.position.toFixed(1)
    }));
  } catch (error) {
    throw new Error(`Failed to get page performance: ${error.message}`);
  }
}

export default {
  testConnection,
  getTopPages,
  getTopQueries,
  getOpportunities,
  getNearMisses,
  getPagePerformance
};
