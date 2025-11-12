/**
 * Text Cleanup Utilities
 *
 * Functions for cleaning up text extracted from various sources,
 * particularly PDFs with encoding issues.
 */

/**
 * Clean up broken ligature characters from PDF text extraction.
 *
 * PDFs with incorrect ToUnicode CMap mappings often have ligatures
 * (fi, ff, fl, ffi, ffl) extracted as wrong characters or blank spaces.
 * This function fixes common broken patterns while avoiding false positives.
 *
 * Common broken patterns:
 * - ! → ffi (e.g., "tra!c" → "traffic")
 * - ® → fi (e.g., "de®ne" → "define")
 * - € → ff (e.g., "o€er" → "offer")
 * - ¬ → fl (e.g., "re¬ect" → "reflect")
 * - Unicode ligatures (ﬁ, ﬀ, etc.)
 *
 * False positive prevention:
 * - Only replaces when surrounded by word characters (letters)
 * - Preserves real punctuation at word boundaries
 *
 * @param text - Raw text from PDF selection
 * @returns Cleaned text with ligatures fixed
 *
 * @example
 * ```typescript
 * cleanupPDFLigatures('tra!c');  // → 'traffic'
 * cleanupPDFLigatures('Hello!'); // → 'Hello!' (preserves punctuation)
 * cleanupPDFLigatures('de®ne');  // → 'define'
 * ```
 */
export function cleanupPDFLigatures(text: string): string {
  // Handle empty or whitespace-only strings
  if (!text || text.trim().length === 0) {
    return text;
  }

  // Fast path: skip processing if no potential ligature issues detected
  // Check for common broken characters and Unicode ligatures
  if (!/[!®€¬™\uFB00-\uFB04]/.test(text)) {
    return text;
  }

  // Fix Unicode ligatures (overlap with Python helper, but safe as fallback)
  // These are proper Unicode ligature characters that should be expanded
  text = text.replace(/\uFB00/g, 'ff');  // ﬀ (LATIN SMALL LIGATURE FF)
  text = text.replace(/\uFB01/g, 'fi');  // ﬁ (LATIN SMALL LIGATURE FI)
  text = text.replace(/\uFB02/g, 'fl');  // ﬂ (LATIN SMALL LIGATURE FL)
  text = text.replace(/\uFB03/g, 'ffi'); // ﬃ (LATIN SMALL LIGATURE FFI)
  text = text.replace(/\uFB04/g, 'ffl'); // ﬄ (LATIN SMALL LIGATURE FFL)

  // Fix broken encodings from incorrect PDF ToUnicode CMap mappings
  // Context-aware: only replace when between word characters (letters)
  // This prevents false positives like "Hello!" → "Helloffi"

  // ffi patterns (most common based on real-world reports)
  // Matches: letter + ! + letter → letter + ffi + letter
  text = text.replace(/([a-z])!([a-z])/gi, '$1ffi$2');

  // fi patterns
  // ® (registered trademark) or ™ (trademark) between letters
  text = text.replace(/([a-z])®([a-z])/gi, '$1fi$2');
  text = text.replace(/([a-z])™([a-z])/gi, '$1fi$2');

  // ff patterns
  // € (euro symbol) between letters
  text = text.replace(/([a-z])€([a-z])/gi, '$1ff$2');

  // fl patterns
  // ¬ (not sign) between letters
  text = text.replace(/([a-z])¬([a-z])/gi, '$1fl$2');

  // ffl patterns (must check before ff patterns to avoid partial matches)
  // Specific patterns for ffl ligature
  text = text.replace(/([a-z])!fl/gi, '$1ffl');
  text = text.replace(/([a-z])€l/gi, '$1ffl');

  return text;
}

/**
 * Check if text likely came from a PDF with ligature issues.
 * Useful for logging/debugging.
 *
 * @param text - Text to check
 * @returns true if text contains potential ligature issues
 */
export function hasLigatureIssues(text: string): boolean {
  return /[!®€¬™\uFB00-\uFB04]/.test(text);
}
