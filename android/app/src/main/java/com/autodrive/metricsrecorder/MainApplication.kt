package com.autodrive.metricsrecorder

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost

class MainApplication : Application(), ReactApplication {
  override val reactNativeHost: ReactNativeHost = object : DefaultReactNativeHost(this) {
    override fun getPackages() = PackageList(this).packages.apply { add(RecorderPackage()) }
    override fun getJSMainModuleName() = "index"
    override fun getUseDeveloperSupport() = BuildConfig.DEBUG
    override val isNewArchEnabled = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
  }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
