// src/features/test-runs/get-test-case-results/parse-steps-xml.ts
import { XMLParser } from 'fast-xml-parser';
import { TestStepDefinition } from '../types';

/**
 * Strip HTML tags from a string and decode common HTML entities.
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  // Strip HTML tags first (before decoding, so encoded angle brackets aren't treated as tags)
  let text = html.replace(/<[^>]*>/g, '');
  // Decode HTML entities
  text = text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  return text.trim();
}

/**
 * Parse the Microsoft.VSTS.TCM.Steps XML field into step definitions.
 */
export function parseStepsXml(xml: string): TestStepDefinition[] {
  if (!xml) return [];

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'step' || name === 'parameterizedString',
  });

  const parsed = parser.parse(xml);
  const steps = parsed?.steps?.step;
  if (!steps || !Array.isArray(steps)) return [];

  return steps.map((step: Record<string, unknown>) => {
    const strings = step.parameterizedString as
      | Array<string | Record<string, unknown>>
      | undefined;

    const extractText = (
      entry: string | Record<string, unknown> | undefined,
    ): string => {
      if (entry === undefined || entry === null) return '';
      if (typeof entry === 'string') return entry;
      // fast-xml-parser returns { '#text': '...', '@_attr': '...' } when element has both attributes and text
      if (typeof entry === 'object' && '#text' in entry)
        return String(entry['#text'] ?? '');
      return '';
    };

    const actionRaw = Array.isArray(strings) ? extractText(strings[0]) : '';
    const expectedRaw = Array.isArray(strings) ? extractText(strings[1]) : '';

    return {
      stepId: Number(step['@_id']),
      action: stripHtml(actionRaw),
      expectedResult: stripHtml(expectedRaw),
    };
  });
}
