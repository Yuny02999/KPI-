const { run } = require("react-native/cli");

// Gradle uses an ASCII drive alias, while Metro resolves the physical module paths.
process.chdir(process.env.APK_COUNTER_JS_ROOT);
run();
