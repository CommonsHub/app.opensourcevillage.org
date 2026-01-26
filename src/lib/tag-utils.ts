/**
 * Tag Filtering and Management Utilities
 *
 * Provides consistent tag handling, filtering, and normalization
 * for workshops, offers, and marketplace filtering.
 */

/**
 * Normalize a tag to lowercase and trim whitespace
 *
 * @param tag - Raw tag string
 * @returns Normalized tag
 *
 * @example
 * normalizeTag('  React.js  ')
 * // Returns: "react.js"
 */
export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * Normalize an array of tags
 *
 * @param tags - Array of raw tag strings
 * @returns Array of normalized, unique tags
 *
 * @example
 * normalizeTags(['React', 'react', '  Vue  ', 'React'])
 * // Returns: ["react", "vue"]
 */
export function normalizeTags(tags: string[]): string[] {
  const normalized = tags.map(normalizeTag);
  return [...new Set(normalized)]; // Remove duplicates
}

/**
 * Extract tags from an offer object
 * Combines type tag with custom tags
 *
 * @param offer - Offer object with type and tags
 * @returns Array of normalized tags
 *
 * @example
 * extractTagsFromOffer({ type: 'workshop', tags: ['React', 'Frontend'] })
 * // Returns: ["workshop", "react", "frontend"]
 */
export function extractTagsFromOffer<
  T extends { type: string; tags?: string[] }
>(offer: T): string[] {
  const tags = [offer.type, ...(offer.tags || [])];
  return normalizeTags(tags);
}

/**
 * Check if offer matches any of the selected tags
 * Returns true if:
 * - No tags selected (show all)
 * - Offer has at least one matching tag
 *
 * @param offer - Offer with type and tags
 * @param selectedTags - Array of tag filters (can be empty)
 * @returns True if offer matches filter
 *
 * @example
 * const offer = { type: 'workshop', tags: ['react', 'frontend'] };
 * matchesTags(offer, ['react'])
 * // Returns: true
 *
 * matchesTags(offer, [])
 * // Returns: true (no filter)
 *
 * matchesTags(offer, ['backend'])
 * // Returns: false
 */
export function matchesTags<T extends { type: string; tags?: string[] }>(
  offer: T,
  selectedTags: string[]
): boolean {
  // If no tags selected, show all
  if (selectedTags.length === 0) {
    return true;
  }

  const offerTags = extractTagsFromOffer(offer);
  const normalizedFilters = normalizeTags(selectedTags);

  // Check if any offer tag matches any selected tag
  return offerTags.some((tag) => normalizedFilters.includes(tag));
}

/**
 * Filter array of offers by selected tags
 *
 * @param offers - Array of offers
 * @param selectedTags - Array of tag filters
 * @returns Filtered array of offers
 *
 * @example
 * const offers = [
 *   { id: '1', type: 'workshop', tags: ['react'] },
 *   { id: '2', type: '1:1', tags: ['backend'] }
 * ];
 * filterByTags(offers, ['workshop'])
 * // Returns: [{ id: '1', ... }]
 */
export function filterByTags<T extends { type: string; tags?: string[] }>(
  offers: T[],
  selectedTags: string[]
): T[] {
  return offers.filter((offer) => matchesTags(offer, selectedTags));
}

/**
 * Get all unique tags from an array of offers
 * Includes both type tags and custom tags
 *
 * @param offers - Array of offers
 * @returns Sorted array of unique tags
 *
 * @example
 * const offers = [
 *   { type: 'workshop', tags: ['react', 'frontend'] },
 *   { type: '1:1', tags: ['react', 'backend'] }
 * ];
 * getAllTags(offers)
 * // Returns: ["1:1", "backend", "frontend", "react", "workshop"]
 */
export function getAllTags<T extends { type: string; tags?: string[] }>(
  offers: T[]
): string[] {
  const allTags = new Set<string>();

  for (const offer of offers) {
    const tags = extractTagsFromOffer(offer);
    tags.forEach((tag) => allTags.add(tag));
  }

  return Array.from(allTags).sort();
}

/**
 * Get tag counts for all offers
 * Returns map of tag -> count for faceted filtering UI
 *
 * @param offers - Array of offers
 * @returns Map of tag to count
 *
 * @example
 * const offers = [
 *   { type: 'workshop', tags: ['react'] },
 *   { type: 'workshop', tags: ['vue'] },
 *   { type: '1:1', tags: ['react'] }
 * ];
 * getTagCounts(offers)
 * // Returns: Map {
 * //   "workshop" => 2,
 * //   "1:1" => 1,
 * //   "react" => 2,
 * //   "vue" => 1
 * // }
 */
export function getTagCounts<T extends { type: string; tags?: string[] }>(
  offers: T[]
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const offer of offers) {
    const tags = extractTagsFromOffer(offer);
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  return counts;
}

/**
 * Toggle tag selection
 * If tag is selected, remove it. If not selected, add it.
 *
 * @param currentTags - Current selected tags
 * @param tag - Tag to toggle
 * @returns New array of selected tags
 *
 * @example
 * toggleTag(['react', 'vue'], 'angular')
 * // Returns: ["react", "vue", "angular"]
 *
 * toggleTag(['react', 'vue'], 'react')
 * // Returns: ["vue"]
 */
export function toggleTag(currentTags: string[], tag: string): string[] {
  const normalized = normalizeTag(tag);
  const normalizedCurrent = normalizeTags(currentTags);

  if (normalizedCurrent.includes(normalized)) {
    return normalizedCurrent.filter((t) => t !== normalized);
  } else {
    return [...normalizedCurrent, normalized];
  }
}

/**
 * Clear all tag selections
 *
 * @returns Empty array
 *
 * @example
 * clearTags()
 * // Returns: []
 */
export function clearTags(): string[] {
  return [];
}

/**
 * Get display label for a tag
 * Capitalizes first letter and handles special cases
 *
 * @param tag - Tag string
 * @returns Display label
 *
 * @example
 * getTagLabel('workshop')
 * // Returns: "Workshop"
 *
 * getTagLabel('1:1')
 * // Returns: "1:1"
 *
 * getTagLabel('react.js')
 * // Returns: "React.js"
 */
export function getTagLabel(tag: string): string {
  // Special cases
  if (tag === '1:1') return '1:1';

  // Capitalize first letter
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

/**
 * Get tag color class for UI
 * Returns Tailwind CSS color classes based on tag type
 *
 * @param tag - Tag string
 * @returns CSS color classes
 *
 * @example
 * getTagColor('workshop')
 * // Returns: "bg-blue-100 text-blue-800"
 *
 * getTagColor('1:1')
 * // Returns: "bg-green-100 text-green-800"
 */
export function getTagColor(tag: string): string {
  const normalized = normalizeTag(tag);

  // Type-based colors
  if (normalized === 'workshop') {
    return 'bg-blue-100 text-blue-800';
  }
  if (normalized === '1:1') {
    return 'bg-green-100 text-green-800';
  }
  if (normalized === 'offer' || normalized === 'generic') {
    return 'bg-purple-100 text-purple-800';
  }

  // Technology tags
  const techTags = [
    'react',
    'vue',
    'angular',
    'svelte',
    'javascript',
    'typescript',
    'python',
    'rust',
    'go',
  ];
  if (techTags.some((tech) => normalized.includes(tech))) {
    return 'bg-indigo-100 text-indigo-800';
  }

  // Default color
  return 'bg-gray-100 text-gray-800';
}

/**
 * Validate tag format
 * Tags should be 1-30 characters, alphanumeric with hyphens/underscores
 *
 * @param tag - Tag to validate
 * @returns True if valid
 *
 * @example
 * validateTag('react')
 * // Returns: true
 *
 * validateTag('a'.repeat(31))
 * // Returns: false (too long)
 *
 * validateTag('react@js')
 * // Returns: false (invalid character)
 */
export function validateTag(tag: string): boolean {
  if (!tag || tag.length < 1 || tag.length > 30) {
    return false;
  }

  // Allow alphanumeric, hyphens, underscores, dots, colons
  const validPattern = /^[a-zA-Z0-9._:-]+$/;
  return validPattern.test(tag);
}

/**
 * Parse comma-separated tag string into array
 * Filters out invalid tags
 *
 * @param tagString - Comma-separated tags
 * @returns Array of valid, normalized tags
 *
 * @example
 * parseTagString('React, Vue, Angular')
 * // Returns: ["react", "vue", "angular"]
 *
 * parseTagString('react,,vue,  ,invalid@tag')
 * // Returns: ["react", "vue"] (filters invalid)
 */
export function parseTagString(tagString: string): string[] {
  const tags = tagString
    .split(',')
    .map((tag) => normalizeTag(tag))
    .filter((tag) => tag && validateTag(tag));

  return [...new Set(tags)]; // Remove duplicates
}

/**
 * Format tags array as comma-separated string
 *
 * @param tags - Array of tags
 * @returns Comma-separated string
 *
 * @example
 * formatTagsAsString(['react', 'vue', 'angular'])
 * // Returns: "react, vue, angular"
 */
export function formatTagsAsString(tags: string[]): string {
  return tags.join(', ');
}

/**
 * Get suggested tags based on partial input
 * Returns tags that start with the input string
 *
 * @param input - Partial tag input
 * @param allTags - Complete list of available tags
 * @param limit - Maximum suggestions to return (default: 5)
 * @returns Array of suggested tags
 *
 * @example
 * const allTags = ['react', 'react-native', 'redux', 'vue', 'angular'];
 * getSuggestedTags('rea', allTags)
 * // Returns: ["react", "react-native"]
 */
export function getSuggestedTags(
  input: string,
  allTags: string[],
  limit: number = 5
): string[] {
  const normalized = normalizeTag(input);
  if (!normalized) return [];

  return allTags
    .filter((tag) => tag.startsWith(normalized))
    .slice(0, limit);
}

/**
 * Sort tags by count (descending) then alphabetically
 * Useful for displaying popular tags first
 *
 * @param tagCounts - Map of tag to count
 * @returns Sorted array of [tag, count] tuples
 *
 * @example
 * const counts = new Map([
 *   ['react', 10],
 *   ['vue', 5],
 *   ['angular', 5]
 * ]);
 * sortTagsByPopularity(counts)
 * // Returns: [['react', 10], ['angular', 5], ['vue', 5]]
 * // (react first by count, angular/vue alphabetical)
 */
export function sortTagsByPopularity(
  tagCounts: Map<string, number>
): [string, number][] {
  return Array.from(tagCounts.entries()).sort((a, b) => {
    // Sort by count (descending)
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }
    // Then alphabetically
    return a[0].localeCompare(b[0]);
  });
}
