export function validateSEOResponse(response, issueType) {
  if (!response) return { valid: false, reason: 'Empty response' }

  if (issueType === 'meta-description') {
    const { newValue, reasoning, targetKeywords } = response
    
    if (!newValue || newValue.length < 120 || newValue.length > 160) {
      return { valid: false, reason: `Invalid length: ${newValue?.length || 0} chars (need 150-160)` }
    }

    if (!reasoning || reasoning.length < 20) {
      return { valid: false, reason: 'Missing or weak reasoning' }
    }

    if (!targetKeywords || !Array.isArray(targetKeywords) || targetKeywords.length === 0) {
      return { valid: false, reason: 'No target keywords identified' }
    }

    return { valid: true }
  }

  // Default: accept if response exists
  return { valid: true }
}
