import { CELCOM_AFRICA_SMS } from '../config/celcomAfricaSms';

const DARK_OPACITIES = { muted: 0.24, subtle: 0.18, medium: 0.3, strong: 0.42 };
const LIGHT_OPACITIES = { muted: 0.28, subtle: 0.2, medium: 0.34, strong: 0.48 };

let lastThemeColor = '#3b82f6';

export function normalizeHex(color) {
  if (!color || typeof color !== 'string') return null;

  let hex = color.trim();
  if (!hex.startsWith('#')) hex = `#${hex}`;

  if (hex.length === 4) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }

  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : null;
}

function getColorMode() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function hexToRgba(hex, alpha) {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;

  const num = parseInt(normalized.slice(1), 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function adjustColor(hex, amount) {
  const normalized = normalizeHex(hex);
  if (!normalized) return hex;

  const num = parseInt(normalized.slice(1), 16);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00ff) + amount;
  let b = (num & 0x0000ff) + amount;

  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function getThemeAccentColor() {
  const fromDom = getComputedStyle(document.documentElement)
    .getPropertyValue('--theme-color')
    .trim();

  return normalizeHex(fromDom) || lastThemeColor;
}

export function getContrastTextColor(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return '#ffffff';

  const num = parseInt(normalized.slice(1), 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.6 ? '#0f172a' : '#ffffff';
}

export function applyThemeColor(color, colorMode = getColorMode()) {
  const normalized = normalizeHex(color);
  if (!normalized) return;

  lastThemeColor = normalized;

  const opacities = colorMode === 'light' ? LIGHT_OPACITIES : DARK_OPACITIES;
  const root = document.documentElement;

  root.style.setProperty('--theme-color', normalized);
  root.style.setProperty('--theme-color-hover', adjustColor(normalized, 20));
  root.style.setProperty('--theme-color-muted', hexToRgba(normalized, opacities.muted));
  root.style.setProperty('--theme-tint-subtle', hexToRgba(normalized, opacities.subtle));
  root.style.setProperty('--theme-tint-medium', hexToRgba(normalized, opacities.medium));
  root.style.setProperty('--theme-tint-strong', hexToRgba(normalized, opacities.strong));
}

export function reapplyThemeColor() {
  applyThemeColor(lastThemeColor);
}

export const emptyConfig = {
  business: { name: '', address: '', phone: '', email: '', logo: '' },
  theme: { color: '#3b82f6' },
  email: {
    provider: 'resend',
    fromAddress: '',
    resendApiKey: '',
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPassword: '',
    secure: false,
  },
  sms: { ...CELCOM_AFRICA_SMS.DEFAULT_SMS_CONFIG, provider: '' },
  auth: { otpOnLogin: true },
};
