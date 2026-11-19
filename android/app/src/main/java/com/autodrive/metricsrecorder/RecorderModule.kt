package com.autodrive.metricsrecorder

import android.Manifest
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.HapticFeedbackConstants
import androidx.core.content.FileProvider
import androidx.core.location.LocationManagerCompat
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ViewManager
import java.io.File

class RecorderPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(RecorderModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}

class RecorderModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {
  private val manager = context.getSystemService(LocationManager::class.java)
  private val main = Handler(Looper.getMainLooper())
  private val watches = mutableMapOf<Int, LocationListener>()
  private var cancelSingleRequest: (() -> Unit)? = null

  override fun getName() = "RecorderNative"

  private fun enabled(provider: String) = provider in manager.allProviders && manager.isProviderEnabled(provider)

  private fun hasPrecisePermission() =
    context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

  private fun providers(preferNetwork: Boolean): List<String> {
    val network = LocationManager.NETWORK_PROVIDER
    val gps = LocationManager.GPS_PROVIDER
    val candidates = if (hasPrecisePermission()) listOf(gps, network, "fused") else listOf(network, "fused")
    val available = candidates.filter(::enabled).let {
      if (it.any { provider -> provider != "fused" }) it - "fused" else it
    }
    return if (preferNetwork && network in available) listOf(network) else available
  }

  private fun position(location: Location): WritableMap = Arguments.createMap().apply {
    putDouble("timestamp", location.time.toDouble())
    putMap("coords", Arguments.createMap().apply {
      putBoolean("precise", hasPrecisePermission())
      putDouble("latitude", location.latitude)
      putDouble("longitude", location.longitude)
      putDouble("accuracy", if (location.hasAccuracy()) location.accuracy.toDouble() else 10000.0)
      if (location.hasSpeed()) putDouble("speed", location.speed.toDouble())
      if (location.hasBearing()) putDouble("heading", location.bearing.toDouble())
      if (location.hasAltitude()) putDouble("altitude", location.altitude)
    })
  }

  private abstract class PositionListener : LocationListener {
    override fun onProviderEnabled(provider: String) = Unit
    override fun onProviderDisabled(provider: String) = Unit

    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
  }

  @ReactMethod
  fun getProviderStatus(promise: Promise) {
    try {
      promise.resolve(Arguments.createMap().apply {
        putBoolean("locationServicesEnabled", LocationManagerCompat.isLocationEnabled(manager))
        putBoolean("gpsAvailable", enabled(LocationManager.GPS_PROVIDER))
        putBoolean("networkAvailable", enabled(LocationManager.NETWORK_PROVIDER))
        putBoolean("passiveAvailable", enabled(LocationManager.PASSIVE_PROVIDER))
      })
    } catch (error: Exception) {
      promise.reject("location-status", error)
    }
  }

  @ReactMethod
  fun getLastKnownPosition(maxAge: Double, requiredAccuracy: Double, promise: Promise) {
    try {
      val now = SystemClock.elapsedRealtimeNanos()
      val best = providers(false).mapNotNull(manager::getLastKnownLocation)
        .filter {
          val age = (now - it.elapsedRealtimeNanos) / 1_000_000
          age >= 0 && age <= maxAge && it.hasAccuracy() && it.accuracy <= requiredAccuracy
        }
        .minByOrNull { it.accuracy }
      promise.resolve(best?.let(::position))
    } catch (error: Exception) {
      promise.reject("location-cache", error)
    }
  }

  @ReactMethod
  fun getCurrentPosition(mode: String, timeout: Double, targetAccuracy: Double, maxAge: Double, promise: Promise) {
    main.post {
      cancelSingleRequest?.invoke()
      var best: Location? = null
      var active = true
      lateinit var stop: () -> Unit
      val timer = Runnable {
        stop()
        val location = best?.takeIf {
          (SystemClock.elapsedRealtimeNanos() - it.elapsedRealtimeNanos) / 1_000_000 <= maxAge
        }
        if (location == null) promise.reject("location-timeout", "定位超时")
        else promise.resolve(position(location))
      }
      val listener = object : PositionListener() {
        override fun onLocationChanged(location: Location) {
          val age = (SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos) / 1_000_000
          if (active && age in 0L..maxAge.toLong()) {
            val previous = best?.takeIf {
              (location.elapsedRealtimeNanos - it.elapsedRealtimeNanos) / 1_000_000 <= maxAge
            }
            if (previous == null || (location.hasAccuracy() &&
                (!previous.hasAccuracy() || location.accuracy <= previous.accuracy))) {
              best = location
            }
            if (location.hasAccuracy() && location.accuracy <= targetAccuracy) {
              stop()
              promise.resolve(position(location))
            }
          }
        }
      }
      stop = {
        main.removeCallbacks(timer)
        manager.removeUpdates(listener)
        active = false
        cancelSingleRequest = null
      }
      cancelSingleRequest = {
        stop()
        promise.reject("location-cancelled", "定位请求已取消")
      }
      try {
        val candidates = providers(mode == "balanced")
        check(candidates.isNotEmpty()) { "没有可用的定位服务" }
        for (provider in candidates) {
          manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
        }
        main.postDelayed(timer, timeout.toLong())
      } catch (error: Exception) {
        stop()
        promise.reject("location-request", error)
      }
    }
  }

  @ReactMethod
  fun cancelCurrentPosition() {
    main.post { cancelSingleRequest?.invoke() }
  }

  @ReactMethod
  fun startWatch(id: Int, interval: Double, distance: Double, promise: Promise) {
    main.post {
      var last: Location? = null
      val listener = object : PositionListener() {
        override fun onLocationChanged(location: Location) {
          if (watches[id] !== this) return
          val previous = last
          if (previous != null) {
            val elapsedMs = (location.elapsedRealtimeNanos - previous.elapsedRealtimeNanos) / 1_000_000
            if (elapsedMs < interval || location.distanceTo(previous) < distance) return
            if (elapsedMs < 5000 && previous.hasAccuracy() &&
                (!location.hasAccuracy() || location.accuracy > previous.accuracy * 2)) return
          }
          last = location
          val update = position(location).apply { putInt("id", id) }
          context.emitDeviceEvent("RecorderLocation", update)
        }
      }
      try {
        val candidates = providers(false)
        check(candidates.isNotEmpty()) { "没有可用的定位服务" }
        watches[id] = listener
        for (provider in candidates) {
          manager.requestLocationUpdates(
            provider, interval.toLong(), distance.toFloat(), listener, Looper.getMainLooper()
          )
        }
        promise.resolve(null)
      } catch (error: Exception) {
        watches.remove(id)
        manager.removeUpdates(listener)
        promise.reject("location-watch", error)
      }
    }
  }

  @ReactMethod
  fun stopWatch(id: Int) {
    main.post { watches.remove(id)?.let { manager.removeUpdates(it) } }
  }

  @ReactMethod
  fun haptic() {
    val activity = context.currentActivity ?: return
    activity.runOnUiThread {
      activity.window.decorView.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
    }
  }

  @ReactMethod
  fun exportFile(name: String, content: String, mimeType: String, title: String, promise: Promise) {
    main.post {
      try {
        require(name == File(name).name && name != "." && name != "..")
        val directory = File(context.filesDir, "exports").apply { mkdirs() }
        val file = File(directory, name).apply { writeText(content) }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.exports", file)
        val send = Intent(Intent.ACTION_SEND).apply {
          type = mimeType
          putExtra(Intent.EXTRA_STREAM, uri)
          clipData = ClipData.newRawUri(name, uri)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val activity = context.currentActivity ?: error("应用未处于前台")
        activity.startActivity(Intent.createChooser(send, title))
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("export-file", error)
      }
    }
  }

  override fun invalidate() {
    main.post {
      cancelSingleRequest?.invoke()
      watches.values.forEach { manager.removeUpdates(it) }
      watches.clear()
    }
    super.invalidate()
  }
}
