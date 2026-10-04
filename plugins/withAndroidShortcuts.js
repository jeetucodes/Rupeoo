const { withAndroidManifest, withDangerousMod, withStringsXml } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withAndroidShortcuts = (config) => {
  // 1. Create shortcuts.xml in res/xml
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const resDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res'
      );
      const xmlDir = path.join(resDir, 'xml');

      if (!fs.existsSync(xmlDir)) {
        fs.mkdirSync(xmlDir, { recursive: true });
      }

      const shortcutsXmlContent = `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
  <shortcut
    android:shortcutId="add_expense"
    android:enabled="true"
    android:icon="@drawable/ic_launcher_foreground"
    android:shortcutShortLabel="@string/shortcut_add_expense_short"
    android:shortcutLongLabel="@string/shortcut_add_expense_long">
    <intent
      android:action="android.intent.action.VIEW"
      android:targetPackage="com.innovatexlabs.paisewaise"
      android:data="rupeo://quick-add?type=expense" />
    <categories android:name="android.shortcut.conversation" />
  </shortcut>
  <shortcut
    android:shortcutId="add_income"
    android:enabled="true"
    android:icon="@drawable/ic_launcher_foreground"
    android:shortcutShortLabel="@string/shortcut_add_income_short"
    android:shortcutLongLabel="@string/shortcut_add_income_long">
    <intent
      android:action="android.intent.action.VIEW"
      android:targetPackage="com.innovatexlabs.paisewaise"
      android:data="rupeo://quick-add?type=income" />
    <categories android:name="android.shortcut.conversation" />
  </shortcut>
  <shortcut
    android:shortcutId="add_voice"
    android:enabled="true"
    android:icon="@drawable/ic_launcher_foreground"
    android:shortcutShortLabel="@string/shortcut_voice_short"
    android:shortcutLongLabel="@string/shortcut_voice_long">
    <intent
      android:action="android.intent.action.VIEW"
      android:targetPackage="com.innovatexlabs.paisewaise"
      android:data="rupeo://quick-add-voice" />
    <categories android:name="android.shortcut.conversation" />
  </shortcut>
</shortcuts>
`;

      fs.writeFileSync(path.join(xmlDir, 'shortcuts.xml'), shortcutsXmlContent, 'utf-8');
      return config;
    },
  ]);

  // 2. Add string resources for shortcuts labels
  config = withStringsXml(config, (config) => {
    const strings = config.modResults.resources.string || [];

    const addOrUpdateString = (name, value) => {
      const existing = strings.find((s) => s.$.name === name);
      if (existing) {
        existing._ = value;
      } else {
        strings.push({ $: { name }, _: value });
      }
    };

    addOrUpdateString('shortcut_add_expense_short', 'Add Expense');
    addOrUpdateString('shortcut_add_expense_long', 'Add Expense');
    addOrUpdateString('shortcut_add_income_short', 'Add Income');
    addOrUpdateString('shortcut_add_income_long', 'Add Income');
    addOrUpdateString('shortcut_voice_short', 'Voice Entry');
    addOrUpdateString('shortcut_voice_long', 'Voice Entry');

    config.modResults.resources.string = strings;
    return config;
  });

  // 3. Link shortcuts.xml in AndroidManifest.xml
  config = withAndroidManifest(config, (config) => {
    const mainApplication = config.modResults.manifest.application?.[0];
    if (!mainApplication) return config;

    const mainActivity = mainApplication.activity?.find((act) => {
      return act['intent-filter']?.some((filter) =>
        filter.action?.some(
          (action) => action.$['android:name'] === 'android.intent.action.MAIN'
        )
      );
    }) || mainApplication.activity?.[0];

    if (!mainActivity) return config;

    if (!mainActivity['meta-data']) {
      mainActivity['meta-data'] = [];
    }

    const hasShortcutsMeta = mainActivity['meta-data'].some(
      (m) => m.$['android:name'] === 'android.app.shortcuts'
    );

    if (!hasShortcutsMeta) {
      mainActivity['meta-data'].push({
        $: {
          'android:name': 'android.app.shortcuts',
          'android:resource': '@xml/shortcuts',
        },
      });
    }

    return config;
  });

  return config;
};

module.exports = withAndroidShortcuts;
