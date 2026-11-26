export const CONFIG = {
  API_BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  DEMO_BEARER_TOKEN: process.env.NEXT_PUBLIC_DEMO_TOKEN || 'local-demo-token-change-me',
  APP_VERSION: 'v0.1.0',
  MAX_UPLOAD_MB: 10,
  SUPPORTED_EXTENSIONS: '.pdf,.csv',
  SUPPORTED_MIME_TYPES: 'application/pdf,text/csv',
} as const;

export const SECTOR_OPTIONS = [
  'Professional services',
  'Financial services',
  'Manufacturing',
  'Healthcare',
  'Retail',
  'Logistics',
  'Other',
] as const;

export const DEFAULT_PROCESS_FORM = {
  process_name: 'Invoice review',
  sector: 'Professional services',
  period: 'Last 30 days',
  unit: 'cases',
  goals: 'Reduce manual handling and rework',
};

export const DEFAULT_ACTIVITY_FORM = {
  label: 'Review invoice',
  monthly_volume: '100',
  minutes_per_unit: '6',
  hourly_rate: '30',
  currency: 'GBP',
};
