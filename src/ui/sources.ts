/**
 * The public reports behind the scenarios (SPEC section 5.1). These are the
 * only places a real organisation is named, as citations, never as callers.
 * Keys match scenarios/SOURCES.md.
 */
export interface SourceInfo {
  title: string;
  publisher: string;
  url: string;
}

export const SOURCES: Record<string, SourceInfo> = {
  'FTC-OA-2025': {
    title: 'Protecting Older Consumers 2024–2025',
    publisher: 'Federal Trade Commission, report to Congress, December 2025',
    url: 'https://www.ftc.gov/system/files/ftc_gov/pdf/P144400-OlderAdultsReportDec2025.pdf',
  },
  'IC3-2025': {
    title: '2025 Internet Crime Report',
    publisher: 'FBI Internet Crime Complaint Center',
    url: 'https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf',
  },
  'FTC-IMP-2026': {
    title: 'New trends in reports of imposter scams',
    publisher: 'Federal Trade Commission, consumer alert, May 2026',
    url: 'https://consumer.ftc.gov/consumer-alerts/2026/05/new-trends-reports-imposter-scams',
  },
};
