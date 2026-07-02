/**
 * Lightweight User-Agent parser.
 * Extracts browser, OS, device type, and vendor without external dependencies.
 */

const OS_MATCHERS = [
  [/Windows NT 10\.0/i, 'Windows 10/11'],
  [/Windows NT 6\.3/i, 'Windows 8.1'],
  [/Windows NT 6\.2/i, 'Windows 8'],
  [/Windows NT 6\.1/i, 'Windows 7'],
  [/Windows Phone/i, 'Windows Phone'],
  [/Windows/i, 'Windows'],
  [/iPhone/i, 'iOS'],
  [/iPad/i, 'iPadOS'],
  [/Mac OS X/i, 'macOS'],
  [/Android/i, 'Android'],
  [/CrOS/i, 'ChromeOS'],
  [/Linux/i, 'Linux'],
];

const BROWSER_MATCHERS = [
  [/Edg(?:e|A|iOS)?\/([0-9.]+)/i, 'Edge'],
  [/OPR\/([0-9.]+)/i, 'Opera'],
  [/Opera\/([0-9.]+)/i, 'Opera'],
  [/SamsungBrowser\/([0-9.]+)/i, 'Samsung Internet'],
  [/CriOS\/([0-9.]+)/i, 'Chrome'],
  [/Chrome\/([0-9.]+)/i, 'Chrome'],
  [/FxiOS\/([0-9.]+)/i, 'Firefox'],
  [/Firefox\/([0-9.]+)/i, 'Firefox'],
  [/Version\/([0-9.]+).*Safari/i, 'Safari'],
  [/MSIE ([0-9.]+)/i, 'Internet Explorer'],
  [/Trident.*rv:([0-9.]+)/i, 'Internet Explorer'],
];

function shortVersion(value) {
  if (!value) return '';
  return value.split('.').slice(0, 2).join('.');
}

function parseUserAgent(userAgent = '') {
  const raw = String(userAgent || '').trim();
  const result = {
    raw,
    browser: 'Unknown',
    browserVersion: '',
    os: 'Unknown',
    deviceType: 'unknown',
    deviceVendor: '',
  };

  if (!raw) return result;

  for (const [regex, name] of OS_MATCHERS) {
    if (regex.test(raw)) {
      result.os = name;
      break;
    }
  }

  if (/bot|crawler|spider|crawling|slurp|bingpreview/i.test(raw)) {
    result.deviceType = 'bot';
  } else if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(raw)) {
    result.deviceType = 'tablet';
  } else if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry/i.test(raw)) {
    result.deviceType = 'mobile';
  } else {
    result.deviceType = 'desktop';
  }

  if (/iPhone|iPad|iPod|Macintosh/i.test(raw)) result.deviceVendor = 'Apple';
  else if (/SamsungBrowser|Samsung|SM-/i.test(raw)) result.deviceVendor = 'Samsung';
  else if (/Pixel|Nexus/i.test(raw)) result.deviceVendor = 'Google';
  else if (/Huawei|HUAWEI|Honor/i.test(raw)) result.deviceVendor = 'Huawei';
  else if (/Xiaomi|Redmi|MI /i.test(raw)) result.deviceVendor = 'Xiaomi';
  else if (/OnePlus/i.test(raw)) result.deviceVendor = 'OnePlus';
  else if (/Windows/i.test(raw)) result.deviceVendor = 'Microsoft';

  for (const [regex, name] of BROWSER_MATCHERS) {
    const match = raw.match(regex);
    if (match) {
      result.browser = name;
      result.browserVersion = shortVersion(match[1]);
      break;
    }
  }

  return result;
}

module.exports = { parseUserAgent };
