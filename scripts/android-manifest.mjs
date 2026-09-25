// Manifest edits that `npx cap add android` does not make.
//
// Capacitor generates a manifest with one launcher activity. The Share Target
// plugin needs intent filters on that activity to receive what other apps
// share — without them the app never appears in Android's share sheet, which
// is how a link from Instagram or a browser is supposed to arrive.
//
// Kept as a string transform rather than an XML library so it can be unit
// tested and so re-running it is a no-op: the script is meant to be safe to
// run on every sync, and an edit that duplicates itself each time is not.

export const SHARE_MARKER = 'noteai-share-target'

/** The filters the app registers, as they appear inside <activity>. */
export const SHARE_INTENT_FILTERS = `
            <!-- ${SHARE_MARKER}: added by scripts/prepare-android.mjs.
                 Without these the app is absent from Android's share sheet. -->
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/*" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="image/*" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="video/*" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.SEND_MULTIPLE" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="image/*" />
            </intent-filter>
`

/** True when the manifest already carries our filters. */
export function hasShareTarget(manifest = '') {
  return String(manifest).includes(SHARE_MARKER)
}

/**
 * Inserts the filters into the launcher activity. Returns the manifest
 * unchanged when they are already present, and throws when the activity the
 * filters belong to cannot be found — silently producing a manifest without
 * them is how this breaks without anyone noticing.
 */
export function withShareTarget(manifest = '') {
  const text = String(manifest)
  if (hasShareTarget(text)) return text

  // Anchor on the LAUNCHER filter: that is the activity Android opens, and the
  // one a share has to reach.
  const launcher = /<category\s+android:name="android\.intent\.category\.LAUNCHER"\s*\/>\s*<\/intent-filter>/
  const match = launcher.exec(text)
  if (!match) {
    throw new Error('Не найден launcher-activity в AndroidManifest.xml — манифест не изменён')
  }
  const at = match.index + match[0].length
  return `${text.slice(0, at)}\n${SHARE_INTENT_FILTERS}${text.slice(at)}`
}

/** Checks the package id has not drifted from capacitor.config.json. */
export function assertApplicationId(buildGradle = '', expected = '') {
  const found = /applicationId\s+["']([^"']+)["']/.exec(String(buildGradle))?.[1] || ''
  if (!expected) throw new Error('В capacitor.config.json не задан appId')
  if (found !== expected) {
    // Changing the package id of a published app orphans every install: the
    // store treats it as a different application.
    throw new Error(`applicationId в android/app/build.gradle равен "${found}", а в capacitor.config.json — "${expected}". Менять package id нельзя.`)
  }
  return found
}
