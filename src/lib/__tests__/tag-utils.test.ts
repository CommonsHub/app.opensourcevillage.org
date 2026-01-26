/**
 * Tests for Tag Filtering and Management Utilities
 * Verifies consistent tag handling across marketplace and calendar
 */

import {
  normalizeTag,
  normalizeTags,
  extractTagsFromOffer,
  matchesTags,
  filterByTags,
  getAllTags,
  getTagCounts,
  toggleTag,
  clearTags,
  getTagLabel,
  getTagColor,
  validateTag,
  parseTagString,
  formatTagsAsString,
  getSuggestedTags,
  sortTagsByPopularity,
} from '../tag-utils';

describe('Tag Utils - Normalization', () => {
  describe('normalizeTag', () => {
    it('should convert to lowercase', () => {
      expect(normalizeTag('React')).toBe('react');
      expect(normalizeTag('WORKSHOP')).toBe('workshop');
    });

    it('should trim whitespace', () => {
      expect(normalizeTag('  react  ')).toBe('react');
      expect(normalizeTag('\t vue \n')).toBe('vue');
    });

    it('should handle already normalized tags', () => {
      expect(normalizeTag('react')).toBe('react');
    });

    it('should handle special characters', () => {
      expect(normalizeTag('React.js')).toBe('react.js');
      expect(normalizeTag('1:1')).toBe('1:1');
    });
  });

  describe('normalizeTags', () => {
    it('should normalize array of tags', () => {
      const tags = ['React', '  Vue  ', 'ANGULAR'];
      const normalized = normalizeTags(tags);

      expect(normalized).toEqual(['react', 'vue', 'angular']);
    });

    it('should remove duplicates', () => {
      const tags = ['react', 'React', 'REACT', 'vue'];
      const normalized = normalizeTags(tags);

      expect(normalized).toEqual(['react', 'vue']);
    });

    it('should handle empty array', () => {
      expect(normalizeTags([])).toEqual([]);
    });

    it('should handle mixed case duplicates', () => {
      const tags = ['Workshop', 'workshop', 'WORKSHOP'];
      const normalized = normalizeTags(tags);

      expect(normalized).toEqual(['workshop']);
    });
  });

  describe('extractTagsFromOffer', () => {
    it('should extract type and custom tags', () => {
      const offer = {
        type: 'workshop',
        tags: ['react', 'frontend'],
      };

      const extracted = extractTagsFromOffer(offer);
      expect(extracted).toEqual(['workshop', 'react', 'frontend']);
    });

    it('should handle offer without custom tags', () => {
      const offer = {
        type: 'workshop',
      };

      const extracted = extractTagsFromOffer(offer);
      expect(extracted).toEqual(['workshop']);
    });

    it('should normalize all tags', () => {
      const offer = {
        type: 'WORKSHOP',
        tags: ['React', '  Vue  '],
      };

      const extracted = extractTagsFromOffer(offer);
      expect(extracted).toEqual(['workshop', 'react', 'vue']);
    });

    it('should remove duplicates', () => {
      const offer = {
        type: 'workshop',
        tags: ['workshop', 'Workshop', 'react'],
      };

      const extracted = extractTagsFromOffer(offer);
      expect(extracted).toEqual(['workshop', 'react']);
    });
  });
});

describe('Tag Utils - Filtering', () => {
  const mockOffer = (type: string, tags?: string[]) => ({
    id: `${type}-${tags?.join('-') || 'none'}`,
    type,
    tags,
    title: 'Test Offer',
  });

  describe('matchesTags', () => {
    it('should match when no tags selected (show all)', () => {
      const offer = mockOffer('workshop', ['react']);
      expect(matchesTags(offer, [])).toBe(true);
    });

    it('should match when offer has selected tag', () => {
      const offer = mockOffer('workshop', ['react', 'frontend']);
      expect(matchesTags(offer, ['react'])).toBe(true);
    });

    it('should match on type tag', () => {
      const offer = mockOffer('workshop', ['react']);
      expect(matchesTags(offer, ['workshop'])).toBe(true);
    });

    it('should not match when no tags overlap', () => {
      const offer = mockOffer('workshop', ['react']);
      expect(matchesTags(offer, ['backend', 'python'])).toBe(false);
    });

    it('should be case-insensitive', () => {
      const offer = mockOffer('workshop', ['React']);
      expect(matchesTags(offer, ['REACT'])).toBe(true);
    });

    it('should match if any tag matches', () => {
      const offer = mockOffer('workshop', ['react', 'frontend']);
      expect(matchesTags(offer, ['react', 'backend'])).toBe(true);
    });
  });

  describe('filterByTags', () => {
    const offers = [
      mockOffer('workshop', ['react', 'frontend']),
      mockOffer('1:1', ['python', 'backend']),
      mockOffer('workshop', ['vue', 'frontend']),
    ];

    it('should return all offers when no tags selected', () => {
      const filtered = filterByTags(offers, []);
      expect(filtered).toEqual(offers);
    });

    it('should filter by single tag', () => {
      const filtered = filterByTags(offers, ['react']);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toContain('react');
    });

    it('should filter by type tag', () => {
      const filtered = filterByTags(offers, ['workshop']);
      expect(filtered).toHaveLength(2);
      expect(filtered.every(o => o.type === 'workshop')).toBe(true);
    });

    it('should filter by multiple tags (OR logic)', () => {
      const filtered = filterByTags(offers, ['react', 'python']);
      expect(filtered).toHaveLength(2);
    });

    it('should handle empty offers array', () => {
      const filtered = filterByTags([], ['react']);
      expect(filtered).toEqual([]);
    });

    it('should be case-insensitive', () => {
      const filtered = filterByTags(offers, ['REACT']);
      expect(filtered).toHaveLength(1);
    });
  });

  describe('getAllTags', () => {
    const offers = [
      mockOffer('workshop', ['react', 'frontend']),
      mockOffer('1:1', ['python', 'backend']),
      mockOffer('workshop', ['react', 'vue']),
    ];

    it('should extract all unique tags', () => {
      const tags = getAllTags(offers);

      expect(tags).toContain('workshop');
      expect(tags).toContain('1:1');
      expect(tags).toContain('react');
      expect(tags).toContain('frontend');
      expect(tags).toContain('python');
      expect(tags).toContain('backend');
      expect(tags).toContain('vue');
    });

    it('should return sorted tags', () => {
      const tags = getAllTags(offers);

      // Check that array is sorted
      const sorted = [...tags].sort();
      expect(tags).toEqual(sorted);
    });

    it('should not have duplicates', () => {
      const tags = getAllTags(offers);
      const uniqueCount = new Set(tags).size;

      expect(tags.length).toBe(uniqueCount);
    });

    it('should handle empty offers array', () => {
      const tags = getAllTags([]);
      expect(tags).toEqual([]);
    });
  });

  describe('getTagCounts', () => {
    const offers = [
      mockOffer('workshop', ['react', 'frontend']),
      mockOffer('workshop', ['vue', 'frontend']),
      mockOffer('1:1', ['react', 'backend']),
    ];

    it('should count occurrences of each tag', () => {
      const counts = getTagCounts(offers);

      expect(counts.get('workshop')).toBe(2);
      expect(counts.get('1:1')).toBe(1);
      expect(counts.get('react')).toBe(2);
      expect(counts.get('frontend')).toBe(2);
      expect(counts.get('vue')).toBe(1);
      expect(counts.get('backend')).toBe(1);
    });

    it('should handle empty offers array', () => {
      const counts = getTagCounts([]);
      expect(counts.size).toBe(0);
    });

    it('should count type tags', () => {
      const counts = getTagCounts(offers);
      expect(counts.get('workshop')).toBeGreaterThan(0);
    });
  });
});

describe('Tag Utils - Selection Management', () => {
  describe('toggleTag', () => {
    it('should add tag if not present', () => {
      const current = ['react', 'vue'];
      const updated = toggleTag(current, 'angular');

      expect(updated).toEqual(['react', 'vue', 'angular']);
    });

    it('should remove tag if present', () => {
      const current = ['react', 'vue', 'angular'];
      const updated = toggleTag(current, 'vue');

      expect(updated).toEqual(['react', 'angular']);
    });

    it('should be case-insensitive', () => {
      const current = ['react'];
      const updated = toggleTag(current, 'REACT');

      expect(updated).toEqual([]); // Should remove 'react'
    });

    it('should normalize tags', () => {
      const current = ['  React  '];
      const updated = toggleTag(current, 'react');

      expect(updated).toEqual([]); // Should treat as same tag
    });

    it('should handle empty current array', () => {
      const updated = toggleTag([], 'react');
      expect(updated).toEqual(['react']);
    });
  });

  describe('clearTags', () => {
    it('should return empty array', () => {
      const cleared = clearTags();
      expect(cleared).toEqual([]);
    });
  });
});

describe('Tag Utils - Display Helpers', () => {
  describe('getTagLabel', () => {
    it('should capitalize first letter', () => {
      expect(getTagLabel('react')).toBe('React');
      expect(getTagLabel('workshop')).toBe('Workshop');
    });

    it('should preserve special cases', () => {
      expect(getTagLabel('1:1')).toBe('1:1');
    });

    it('should handle already capitalized', () => {
      expect(getTagLabel('React')).toBe('React');
    });

    it('should handle dots in tag names', () => {
      expect(getTagLabel('react.js')).toBe('React.js');
    });

    it('should handle empty string', () => {
      expect(getTagLabel('')).toBe('');
    });
  });

  describe('getTagColor', () => {
    it('should return blue for workshop type', () => {
      const color = getTagColor('workshop');
      expect(color).toContain('blue');
    });

    it('should return green for 1:1 type', () => {
      const color = getTagColor('1:1');
      expect(color).toContain('green');
    });

    it('should return purple for offer type', () => {
      const color = getTagColor('offer');
      expect(color).toContain('purple');
    });

    it('should return indigo for tech tags', () => {
      const techTags = ['react', 'vue', 'typescript', 'python'];

      techTags.forEach(tag => {
        const color = getTagColor(tag);
        expect(color).toContain('indigo');
      });
    });

    it('should return gray for unknown tags', () => {
      const color = getTagColor('unknown-tag');
      expect(color).toContain('gray');
    });

    it('should be case-insensitive', () => {
      const lower = getTagColor('workshop');
      const upper = getTagColor('WORKSHOP');
      expect(lower).toBe(upper);
    });
  });
});

describe('Tag Utils - Validation', () => {
  describe('validateTag', () => {
    it('should accept valid alphanumeric tags', () => {
      expect(validateTag('react')).toBe(true);
      expect(validateTag('workshop123')).toBe(true);
    });

    it('should accept tags with hyphens', () => {
      expect(validateTag('react-native')).toBe(true);
    });

    it('should accept tags with underscores', () => {
      expect(validateTag('react_js')).toBe(true);
    });

    it('should accept tags with dots', () => {
      expect(validateTag('react.js')).toBe(true);
    });

    it('should accept tags with colons', () => {
      expect(validateTag('1:1')).toBe(true);
    });

    it('should reject empty tags', () => {
      expect(validateTag('')).toBe(false);
    });

    it('should reject tags that are too long', () => {
      const longTag = 'a'.repeat(31);
      expect(validateTag(longTag)).toBe(false);
    });

    it('should reject tags with special characters', () => {
      expect(validateTag('react@js')).toBe(false);
      expect(validateTag('react#tag')).toBe(false);
      expect(validateTag('react tag')).toBe(false);
    });

    it('should accept single character tags', () => {
      expect(validateTag('a')).toBe(true);
    });

    it('should accept 30 character tags', () => {
      const maxTag = 'a'.repeat(30);
      expect(validateTag(maxTag)).toBe(true);
    });
  });

  describe('parseTagString', () => {
    it('should parse comma-separated tags', () => {
      const tags = parseTagString('React, Vue, Angular');
      expect(tags).toEqual(['react', 'vue', 'angular']);
    });

    it('should filter out empty tags', () => {
      const tags = parseTagString('react,,vue,  ,angular');
      expect(tags).toEqual(['react', 'vue', 'angular']);
    });

    it('should normalize tags', () => {
      const tags = parseTagString('  React  , VUE, angular ');
      expect(tags).toEqual(['react', 'vue', 'angular']);
    });

    it('should remove duplicates', () => {
      const tags = parseTagString('react, React, REACT, vue');
      expect(tags).toEqual(['react', 'vue']);
    });

    it('should filter invalid tags', () => {
      const tags = parseTagString('react, invalid@tag, vue');
      expect(tags).toEqual(['react', 'vue']);
    });

    it('should handle empty string', () => {
      const tags = parseTagString('');
      expect(tags).toEqual([]);
    });

    it('should handle single tag', () => {
      const tags = parseTagString('react');
      expect(tags).toEqual(['react']);
    });
  });

  describe('formatTagsAsString', () => {
    it('should join tags with comma and space', () => {
      const tags = ['react', 'vue', 'angular'];
      const formatted = formatTagsAsString(tags);

      expect(formatted).toBe('react, vue, angular');
    });

    it('should handle single tag', () => {
      const formatted = formatTagsAsString(['react']);
      expect(formatted).toBe('react');
    });

    it('should handle empty array', () => {
      const formatted = formatTagsAsString([]);
      expect(formatted).toBe('');
    });
  });
});

describe('Tag Utils - Suggestions', () => {
  const allTags = [
    'react',
    'react-native',
    'redux',
    'vue',
    'vue-router',
    'angular',
  ];

  describe('getSuggestedTags', () => {
    it('should return tags that start with input', () => {
      const suggestions = getSuggestedTags('rea', allTags);

      expect(suggestions).toContain('react');
      expect(suggestions).toContain('react-native');
      expect(suggestions).not.toContain('redux');
    });

    it('should be case-insensitive', () => {
      const suggestions = getSuggestedTags('REA', allTags);

      expect(suggestions).toContain('react');
      expect(suggestions).toContain('react-native');
    });

    it('should return empty for no matches', () => {
      const suggestions = getSuggestedTags('python', allTags);
      expect(suggestions).toEqual([]);
    });

    it('should limit results', () => {
      const suggestions = getSuggestedTags('r', allTags, 2);
      expect(suggestions.length).toBeLessThanOrEqual(2);
    });

    it('should handle empty input', () => {
      const suggestions = getSuggestedTags('', allTags);
      expect(suggestions).toEqual([]);
    });

    it('should handle exact match', () => {
      const suggestions = getSuggestedTags('react', allTags);
      expect(suggestions).toContain('react');
      expect(suggestions).toContain('react-native');
    });
  });

  describe('sortTagsByPopularity', () => {
    it('should sort by count descending', () => {
      const counts = new Map([
        ['react', 10],
        ['vue', 5],
        ['angular', 3],
      ]);

      const sorted = sortTagsByPopularity(counts);

      expect(sorted[0]).toEqual(['react', 10]);
      expect(sorted[1]).toEqual(['vue', 5]);
      expect(sorted[2]).toEqual(['angular', 3]);
    });

    it('should sort alphabetically when counts are equal', () => {
      const counts = new Map([
        ['vue', 5],
        ['react', 10],
        ['angular', 5],
      ]);

      const sorted = sortTagsByPopularity(counts);

      expect(sorted[0]).toEqual(['react', 10]);
      // angular and vue both have 5, should be alphabetical
      expect(sorted[1][0]).toBe('angular');
      expect(sorted[2][0]).toBe('vue');
    });

    it('should handle empty map', () => {
      const counts = new Map();
      const sorted = sortTagsByPopularity(counts);

      expect(sorted).toEqual([]);
    });

    it('should handle single entry', () => {
      const counts = new Map([['react', 10]]);
      const sorted = sortTagsByPopularity(counts);

      expect(sorted).toEqual([['react', 10]]);
    });

    it('should preserve all entries', () => {
      const counts = new Map([
        ['react', 10],
        ['vue', 8],
        ['angular', 6],
      ]);

      const sorted = sortTagsByPopularity(counts);
      expect(sorted.length).toBe(3);
    });
  });
});

describe('Tag Utils - Integration Scenarios', () => {
  it('should handle complete filtering workflow', () => {
    const offers = [
      { type: 'workshop', tags: ['react', 'frontend'], title: 'React Workshop' },
      { type: '1:1', tags: ['python', 'backend'], title: 'Python Help' },
      { type: 'workshop', tags: ['vue', 'frontend'], title: 'Vue Workshop' },
    ];

    // Get all available tags
    const allTags = getAllTags(offers);
    expect(allTags.length).toBeGreaterThan(0);

    // Get tag counts for faceted UI
    const counts = getTagCounts(offers);
    expect(counts.get('frontend')).toBe(2);

    // Filter by selected tag
    let selectedTags: string[] = [];
    selectedTags = toggleTag(selectedTags, 'frontend');

    const filtered = filterByTags(offers, selectedTags);
    expect(filtered).toHaveLength(2);
    expect(filtered.every(o => o.tags?.includes('frontend'))).toBe(true);
  });

  it('should handle tag input and validation workflow', () => {
    // User types comma-separated tags
    const input = 'React, Vue.js, Invalid@Tag, TypeScript';

    // Parse and validate
    const tags = parseTagString(input);
    expect(tags).not.toContain('invalid@tag'); // Should be filtered out

    // Display as labels
    const labels = tags.map(getTagLabel);
    expect(labels).toContain('React');
    expect(labels).toContain('Vue.js');

    // Get colors for UI
    const colors = tags.map(getTagColor);
    expect(colors.length).toBe(tags.length);
  });

  it('should handle tag suggestion workflow', () => {
    const existingTags = getAllTags([
      { type: 'workshop', tags: ['react', 'react-native', 'redux'] },
      { type: '1:1', tags: ['vue', 'vuex'] },
    ]);

    // User starts typing
    const userInput = 'rea';
    const suggestions = getSuggestedTags(userInput, existingTags, 5);

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every(tag => tag.startsWith('rea'))).toBe(true);
  });

  it('should handle popularity sorting for tag cloud UI', () => {
    const offers = [
      { type: 'workshop', tags: ['react', 'frontend'] },
      { type: 'workshop', tags: ['react', 'frontend'] },
      { type: '1:1', tags: ['vue', 'frontend'] },
    ];

    const counts = getTagCounts(offers);
    const sorted = sortTagsByPopularity(counts);

    // Most popular tags first
    expect(sorted[0][1]).toBeGreaterThanOrEqual(sorted[1][1]);
    expect(sorted[1][1]).toBeGreaterThanOrEqual(sorted[2][1]);
  });
});
