// src/features/test-runs/get-test-case-results/parse-steps-xml.spec.unit.ts
import { parseStepsXml, stripHtml } from './parse-steps-xml';

describe('stripHtml', () => {
  it('should strip HTML tags from text', () => {
    expect(stripHtml('<DIV><P>Hello world</P></DIV>')).toBe('Hello world');
  });

  it('should handle plain text without tags', () => {
    expect(stripHtml('plain text')).toBe('plain text');
  });

  it('should return empty string for empty paragraph', () => {
    expect(stripHtml('<P></P>')).toBe('');
  });

  it('should handle nested tags', () => {
    expect(stripHtml('<DIV><P><B>bold</B> and normal</P></DIV>')).toBe(
      'bold and normal',
    );
  });

  it('should decode HTML entities', () => {
    expect(stripHtml('&lt;value&gt; &amp; &quot;quoted&quot;')).toBe(
      '<value> & "quoted"',
    );
  });
});

describe('parseStepsXml', () => {
  it('should parse steps with action and expected result', () => {
    const xml = `<steps id="0" last="3">
      <step id="2" type="ActionStep">
        <parameterizedString isformatted="true">&lt;P&gt;Set up a customer&lt;/P&gt;</parameterizedString>
        <parameterizedString isformatted="true">&lt;P&gt;Customer exists&lt;/P&gt;</parameterizedString>
        <description/>
      </step>
      <step id="4" type="ActionStep">
        <parameterizedString isformatted="true">&lt;P&gt;Click submit&lt;/P&gt;</parameterizedString>
        <parameterizedString isformatted="true">&lt;P&gt;&lt;/P&gt;</parameterizedString>
        <description/>
      </step>
    </steps>`;

    const result = parseStepsXml(xml);
    expect(result).toEqual([
      {
        stepId: 2,
        action: 'Set up a customer',
        expectedResult: 'Customer exists',
      },
      { stepId: 4, action: 'Click submit', expectedResult: '' },
    ]);
  });

  it('should handle single step', () => {
    const xml = `<steps id="0" last="1">
      <step id="2" type="ActionStep">
        <parameterizedString isformatted="true">&lt;P&gt;Do something&lt;/P&gt;</parameterizedString>
        <parameterizedString isformatted="true">&lt;P&gt;Something happens&lt;/P&gt;</parameterizedString>
        <description/>
      </step>
    </steps>`;

    const result = parseStepsXml(xml);
    expect(result).toEqual([
      {
        stepId: 2,
        action: 'Do something',
        expectedResult: 'Something happens',
      },
    ]);
  });

  it('should return empty array for empty or undefined input', () => {
    expect(parseStepsXml('')).toEqual([]);
    expect(parseStepsXml(undefined as unknown as string)).toEqual([]);
  });

  it('should handle HTML-wrapped content in parameterizedString', () => {
    const xml = `<steps id="0" last="1">
      <step id="2" type="ActionStep">
        <parameterizedString isformatted="true">&lt;DIV&gt;&lt;P&gt;Inspect the generated PDF filename and note the values for %4 and %7.&lt;/P&gt;&lt;/DIV&gt;</parameterizedString>
        <parameterizedString isformatted="true">&lt;DIV&gt;&lt;P&gt;The filename contains the resolved values for %4 and %7.&lt;/P&gt;&lt;/DIV&gt;</parameterizedString>
        <description/>
      </step>
    </steps>`;

    const result = parseStepsXml(xml);
    expect(result).toEqual([
      {
        stepId: 2,
        action:
          'Inspect the generated PDF filename and note the values for %4 and %7.',
        expectedResult:
          'The filename contains the resolved values for %4 and %7.',
      },
    ]);
  });
});
