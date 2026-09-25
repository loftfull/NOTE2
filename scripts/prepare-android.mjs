#!/usr/bin/env node
// Brings the Android project to a buildable state, from any starting point.
//
//   node scripts/prepare-android.mjs
//
// Safe to re-run: every step checks before it acts. It builds the client,
// creates the native project if it is missing, syncs the web assets and
// plugins, applies the manifest changes Capacitor does not make, and refuses
// to continue if the package id has drifted.
//
// It does not build an APK. That needs the Android SDK, which this script
// cannot install for you — it says so at the end, with the command to run.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertApplicationId, hasShareTarget, withShareTarget } from './android-manifest.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const androidDir = join(root, 'android')
const manifestPath = join(androidDir, 'app/src/main/AndroidManifest.xml')
const buildGradlePath = join(androidDir, 'app/build.gradle')

const step = message => console.log(`\n▸ ${message}`)
const ok = message => console.log(`  ✓ ${message}`)
const note = message => console.log(`  · ${message}`)

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: 'inherit' })
}

async function main() {
  step('Сборка клиента')
  if (!existsSync(join(root, 'node_modules'))) {
    throw new Error('Не установлены зависимости. Выполните npm install.')
  }
  run('npm', ['run', 'build'])
  ok('dist/ собран')

  step('Нативный проект')
  if (existsSync(androidDir)) {
    note('android/ уже существует')
  } else {
    run('npx', ['cap', 'add', 'android'])
    ok('android/ создан')
  }

  step('Синхронизация веб-ресурсов и плагинов')
  run('npx', ['cap', 'sync', 'android'])
  ok('cap sync выполнен')

  step('Проверка package id')
  const config = JSON.parse(await readFile(join(root, 'capacitor.config.json'), 'utf8'))
  // Throws rather than fixes: a package id change orphans every existing
  // install, so it is a decision, not a repair.
  const applicationId = assertApplicationId(await readFile(buildGradlePath, 'utf8'), config.appId)
  ok(`applicationId = ${applicationId}`)

  step('Share Target в манифесте')
  const manifest = await readFile(manifestPath, 'utf8')
  if (hasShareTarget(manifest)) {
    note('intent-filter уже на месте')
  } else {
    await writeFile(manifestPath, withShareTarget(manifest), 'utf8')
    ok('добавлены intent-filter для получения ссылок и файлов из share-меню')
  }

  console.log(`
Проект готов к сборке.

Дальше нужен Android SDK — этот скрипт его не ставит:

  export ANDROID_HOME=$HOME/Android/Sdk
  cd android && ./gradlew assembleDebug

APK окажется в android/app/build/outputs/apk/debug/app-debug.apk.
Открыть в Android Studio: npx cap open android
`)
}

main().catch(error => {
  console.error(`\n✗ ${error.message}`)
  process.exit(1)
})
