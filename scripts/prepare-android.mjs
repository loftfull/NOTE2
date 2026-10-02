import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const androidDir = join(root, 'android')
const manifestPath = join(androidDir, 'app/src/main/AndroidManifest.xml')
const appGradlePath = join(androidDir, 'app/build.gradle')
const variablesPath = join(androidDir, 'variables.gradle')
const capacitorConfig = JSON.parse(await readFile(join(root, 'capacitor.config.json'), 'utf8'))
const appId = String(capacitorConfig.appId || 'app.noteai.workspace')
const javaDir = join(androidDir, 'app/src/main/java', ...appId.split('.'))
const mainActivityPath = join(javaDir, 'MainActivity.java')
const securePluginTemplate = join(root, 'native/android/SecureCredentialsPlugin.java')
const securePluginPath = join(javaDir, 'SecureCredentialsPlugin.java')

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
}
function nodeSupported() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  return major > 22 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19)
}

async function installSecureCredentialPlugin() {
  await mkdir(javaDir, { recursive: true })
  let plugin = await readFile(securePluginTemplate, 'utf8')
  plugin = plugin.replace(/^package\s+[\w.]+;/m, `package ${appId};`)
  await writeFile(securePluginPath, plugin)

  let activity = existsSync(mainActivityPath)
    ? await readFile(mainActivityPath, 'utf8')
    : `package ${appId};\n\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {}\n`
  if (!activity.includes('registerPlugin(SecureCredentialsPlugin.class)')) {
    if (!activity.includes('import android.os.Bundle;')) activity = activity.replace(/(package\s+[\w.]+;\s*)/, '$1\nimport android.os.Bundle;\n')
    if (/public class MainActivity extends BridgeActivity\s*\{\s*\}/m.test(activity)) {
      activity = activity.replace(/public class MainActivity extends BridgeActivity\s*\{\s*\}/m, `public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(SecureCredentialsPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n}`)
    } else {
      activity = activity.replace(/public class MainActivity extends BridgeActivity\s*\{/m, `public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(SecureCredentialsPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n`)
    }
  }
  await writeFile(mainActivityPath, activity)
}

async function patchAndroid() {
  if (!existsSync(manifestPath)) throw new Error('AndroidManifest.xml was not generated')
  let manifest = await readFile(manifestPath, 'utf8')
  if (!manifest.includes('android.permission.RECORD_AUDIO')) {
    manifest = manifest.replace('<uses-permission android:name="android.permission.INTERNET" />', '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.RECORD_AUDIO" />')
  }
  if (!manifest.includes('NOTE2_SHARE_TARGET')) {
    const shareFilters = `\n            <!-- NOTE2_SHARE_TARGET: receive links and media shared from Instagram and other apps -->\n            <intent-filter>\n                <action android:name="android.intent.action.SEND" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <data android:mimeType="text/*" />\n            </intent-filter>\n            <intent-filter>\n                <action android:name="android.intent.action.SEND" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <data android:mimeType="image/*" />\n            </intent-filter>\n            <intent-filter>\n                <action android:name="android.intent.action.SEND" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <data android:mimeType="video/*" />\n            </intent-filter>\n            <intent-filter>\n                <action android:name="android.intent.action.SEND_MULTIPLE" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <data android:mimeType="image/*" />\n            </intent-filter>`
    const activityEnd = manifest.indexOf('</activity>')
    if (activityEnd < 0) throw new Error('Main Android activity was not found for share-target patching')
    manifest = manifest.slice(0, activityEnd) + shareFilters + '\n        ' + manifest.slice(activityEnd)
  }
  if (!/android:allowBackup=/.test(manifest)) manifest = manifest.replace('<application', '<application android:allowBackup="false"')
  else manifest = manifest.replace(/android:allowBackup="[^"]*"/, 'android:allowBackup="false"')
  await writeFile(manifestPath, manifest)

  if (existsSync(appGradlePath)) {
    let gradle = await readFile(appGradlePath, 'utf8')
    gradle = gradle.replace("getDefaultProguardFile('proguard-android.txt')", "getDefaultProguardFile('proguard-android-optimize.txt')")
    if (!gradle.includes('sourceCompatibility JavaVersion.VERSION_21')) {
      gradle = gradle.replace(/\n}\nrepositories\s*\{/, `\n    compileOptions {\n        sourceCompatibility JavaVersion.VERSION_21\n        targetCompatibility JavaVersion.VERSION_21\n    }\n}\nrepositories {`)
    }
    await writeFile(appGradlePath, gradle)
  }

  if (existsSync(variablesPath)) {
    let vars = await readFile(variablesPath, 'utf8')
    vars = vars.replace(/minSdkVersion\s*=\s*\d+/, 'minSdkVersion = 24')
      .replace(/compileSdkVersion\s*=\s*\d+/, 'compileSdkVersion = 36')
      .replace(/targetSdkVersion\s*=\s*\d+/, 'targetSdkVersion = 36')
    await writeFile(variablesPath, vars)
  }
  await installSecureCredentialPlugin()
}

if (!nodeSupported()) throw new Error(`Vite 8 requires Node 20.19+ or 22.12+. Current Node: ${process.versions.node}`)
if (!existsSync(join(root, 'node_modules/@capacitor/cli'))) throw new Error('Dependencies are not installed. Run npm install first.')

run('npm', ['run', 'build'])
if (!existsSync(androidDir)) run('npx', ['cap', 'add', 'android'])
await patchAndroid()
run('npx', ['cap', 'sync', 'android'])
await patchAndroid()

console.log('\nAndroid platform prepared.')
console.log('SecureCredentials native bridge installed with Android Keystore AES-GCM.')
console.log('Required checks: Android SDK 36, Java 21, then run: cd android && ./gradlew assembleDebug')
