/**
 * Supported Locales configuration for DukaanVoice AI
 * Includes all 22 Constitutionally Scheduled Indian Languages (Eighth Schedule) + English (base/fallback).
 */

export const SUPPORTED_LOCALES = [
  { code: 'gu', name: 'ગુજરાતી', englishName: 'Gujarati', nativeName: 'ગુજરાતી', dir: 'ltr', script: 'Gujarati', region: 'Gujarat' },
  { code: 'hi', name: 'हिन्दी', englishName: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr', script: 'Devanagari', region: 'North/Central India' },
  { code: 'en', name: 'English', englishName: 'English', nativeName: 'English', dir: 'ltr', script: 'Latin', region: 'India / International' },
  { code: 'as', name: 'অসমীয়া', englishName: 'Assamese', nativeName: 'অসমীয়া', dir: 'ltr', script: 'Bengali-Assamese', region: 'Assam' },
  { code: 'bn', name: 'বাংলা', englishName: 'Bengali', nativeName: 'বাংলা', dir: 'ltr', script: 'Bengali', region: 'West Bengal, Tripura' },
  { code: 'brx', name: 'बड़ो', englishName: 'Bodo', nativeName: 'बड़ो', dir: 'ltr', script: 'Devanagari', region: 'Bodoland / Assam' },
  { code: 'doi', name: 'डोगरी', englishName: 'Dogri', nativeName: 'डोगरी', dir: 'ltr', script: 'Devanagari', region: 'Jammu & Kashmir' },
  { code: 'kn', name: 'ಕನ್ನಡ', englishName: 'Kannada', nativeName: 'ಕನ್ನಡ', dir: 'ltr', script: 'Kannada', region: 'Karnataka' },
  { code: 'ks', name: 'کٲشُر', englishName: 'Kashmiri', nativeName: 'کٲشُر', dir: 'rtl', script: 'Perso-Arabic', region: 'Kashmir' },
  { code: 'kok', name: 'कोंकणी', englishName: 'Konkani', nativeName: 'कोंकणी', dir: 'ltr', script: 'Devanagari', region: 'Goa, Coastal Maharashtra' },
  { code: 'mai', name: 'मैथिली', englishName: 'Maithili', nativeName: 'मैथिली', dir: 'ltr', script: 'Devanagari', region: 'Bihar, Jharkhand' },
  { code: 'ml', name: 'മലയാളം', englishName: 'Malayalam', nativeName: 'മലയാളം', dir: 'ltr', script: 'Malayalam', region: 'Kerala, Lakshadweep' },
  { code: 'mni', name: 'মৈতৈলোন্', englishName: 'Manipuri (Meitei)', nativeName: 'মৈতৈলোন্', dir: 'ltr', script: 'Bengali', region: 'Manipur' },
  { code: 'mr', name: 'मराठी', englishName: 'Marathi', nativeName: 'मराठी', dir: 'ltr', script: 'Devanagari', region: 'Maharashtra' },
  { code: 'ne', name: 'नेपाली', englishName: 'Nepali', nativeName: 'नेपाली', dir: 'ltr', script: 'Devanagari', region: 'Sikkim, West Bengal' },
  { code: 'or', name: 'ଓଡ଼ିଆ', englishName: 'Odia', nativeName: 'ଓଡ଼ିଆ', dir: 'ltr', script: 'Odia', region: 'Odisha' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ', englishName: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', dir: 'ltr', script: 'Gurmukhi', region: 'Punjab' },
  { code: 'sa', name: 'संस्कृतम्', englishName: 'Sanskrit', nativeName: 'संस्कृतम्', dir: 'ltr', script: 'Devanagari', region: 'Pan-India classical' },
  { code: 'sat', name: 'ᱥᱟᱱᱛᱟᱲᱤ', englishName: 'Santali', nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ', dir: 'ltr', script: 'Ol Chiki', region: 'Jharkhand, West Bengal, Odisha' },
  { code: 'sd', name: 'سنڌي', englishName: 'Sindhi', nativeName: 'سنڌي', dir: 'rtl', script: 'Perso-Arabic', region: 'Sindhi community / Western India' },
  { code: 'ta', name: 'தமிழ்', englishName: 'Tamil', nativeName: 'தமிழ்', dir: 'ltr', script: 'Tamil', region: 'Tamil Nadu, Puducherry' },
  { code: 'te', name: 'తెలుగు', englishName: 'Telugu', nativeName: 'తెలుగు', dir: 'ltr', script: 'Telugu', region: 'Andhra Pradesh, Telangana' },
  { code: 'ur', name: 'اُردُو', englishName: 'Urdu', nativeName: 'اُردُو', dir: 'rtl', script: 'Perso-Arabic', region: 'Pan-India / Jammu & Kashmir' },
]

export const SCHEDULED_INDIAN_LANGUAGES = SUPPORTED_LOCALES.filter((l) => l.code !== 'en')
export const RTL_LOCALES = ['ur', 'ks', 'sd']

export const DEFAULT_LOCALE = 'gu'
export const FALLBACK_LOCALE = 'en'

export function getLocaleConfig(code) {
  const found = SUPPORTED_LOCALES.find((l) => l.code === code)
  return found || SUPPORTED_LOCALES.find((l) => l.code === FALLBACK_LOCALE)
}

export const getLocaleMetadata = getLocaleConfig

export function isRTL(code) {
  const cfg = getLocaleConfig(code)
  return cfg.dir === 'rtl'
}

export const isRtlLocale = isRTL
