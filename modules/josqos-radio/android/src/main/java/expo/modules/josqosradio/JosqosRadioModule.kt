package expo.modules.josqosradio

import android.content.Context
import android.os.Build
import android.telephony.CellSignalStrengthLte
import android.telephony.CellSignalStrengthNr
import android.telephony.SubscriptionManager
import android.telephony.TelephonyCallback
import android.telephony.TelephonyDisplayInfo
import android.telephony.TelephonyManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** What the phone says about its mobile-data connection right now. Mirrors RadioSnapshot in JosqosRadio.types.ts. */
class RadioSnapshot : Record {
  /** "4G", "5G", or null when the phone is not on 4G/5G (or cannot tell). */
  @Field var technology: String? = null

  /** False when [technology] is only a best guess, so the app must not enforce it. */
  @Field var reliable: Boolean = true

  /** LTE, NR, 3G, 2G, UNKNOWN or OTHER. */
  @Field var networkType: String = "UNKNOWN"

  /** 5G non-standalone: an LTE anchor plus an NR carrier. */
  @Field var nsa: Boolean = false
  @Field var operator: String? = null

  /** RSRP in dBm of the serving technology (NR for 5G, LTE for 4G). */
  @Field var signalDbm: Int? = null
  @Field var lteRsrp: Int? = null
  @Field var lteSinr: Int? = null
  @Field var nrRsrp: Int? = null
  @Field var nrSinr: Int? = null
  @Field var sdk: Int = 0
}

/**
 * Reads network generation and signal quality from Android's telephony stack.
 *
 * - Signal strength (RSRP / SINR) needs no permission.
 * - Android 12+ (API 31+) also gives the network type and the 5G-NSA flag through a
 *   TelephonyCallback, again without a permission.
 * - Android 11 and below can only report LTE vs NR standalone; NSA 5G looks like LTE there, so the
 *   result is marked not reliable instead of guessing.
 */
class JosqosRadioModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  // Latest values from the display-info callback (API 31+).
  @Volatile private var callbackNetworkType: Int? = null
  @Volatile private var callbackOverrideType: Int = TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NONE
  @Volatile private var firstInfo = CountDownLatch(1)

  // Held as Any so the class still loads on Android versions that predate TelephonyCallback.
  private var callback: Any? = null
  private var callbackManager: TelephonyManager? = null
  private var callbackSubId = SubscriptionManager.INVALID_SUBSCRIPTION_ID

  override fun definition() = ModuleDefinition {
    Name("JosqosRadio")

    OnDestroy { unregisterCallback() }

    AsyncFunction("getRadioInfo") { readRadioSnapshot() }
  }

  private fun readRadioSnapshot(): RadioSnapshot {
    val out = RadioSnapshot()
    out.sdk = Build.VERSION.SDK_INT
    val tm = dataTelephonyManager() ?: return out

    ensureCallback(tm)
    // The first callback arrives right after registering; give it a moment so NSA is not missed.
    if (callback != null) firstInfo.await(600, TimeUnit.MILLISECONDS)

    val dataType: Int? = callbackNetworkType ?: try {
      tm.dataNetworkType
    } catch (e: SecurityException) {
      null
    }
    out.networkType = networkLabel(dataType)
    out.operator = tm.networkOperatorName?.takeIf { it.isNotBlank() }
    readSignals(tm, out)
    classify(dataType, out)
    return out
  }

  /** The SIM that carries mobile data, which on a dual-SIM phone may not be the default voice SIM. */
  private fun dataTelephonyManager(): TelephonyManager? {
    val base = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager ?: return null
    val subId = SubscriptionManager.getDefaultDataSubscriptionId()
    return if (subId != SubscriptionManager.INVALID_SUBSCRIPTION_ID) base.createForSubscriptionId(subId) else base
  }

  private fun readSignals(tm: TelephonyManager, out: RadioSnapshot) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
    val strengths = try {
      tm.signalStrength?.cellSignalStrengths
    } catch (e: SecurityException) {
      null
    }
    if (strengths == null) return
    for (s in strengths) {
      if (s is CellSignalStrengthLte) {
        out.lteRsrp = rsrp(s.rsrp)
        out.lteSinr = sinr(s.rssnr)
      } else if (s is CellSignalStrengthNr) {
        out.nrRsrp = rsrp(s.ssRsrp)
        out.nrSinr = sinr(s.ssSinr)
      }
    }
  }

  private fun classify(dataType: Int?, out: RadioSnapshot) {
    val nrSignal = out.nrRsrp != null
    when (dataType) {
      TelephonyManager.NETWORK_TYPE_NR -> {
        out.technology = "5G"
        out.signalDbm = out.nrRsrp
      }
      TelephonyManager.NETWORK_TYPE_LTE -> {
        val overrideType = callbackOverrideType
        val fiveGIcon = overrideType == TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NR_NSA ||
          overrideType == TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NR_NSA_MMWAVE ||
          overrideType == TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NR_ADVANCED
        when {
          Build.VERSION.SDK_INT < Build.VERSION_CODES.S || callback == null -> {
            // Cannot see NSA on this phone: LTE might really be 5G NSA.
            out.reliable = false
            out.signalDbm = out.lteRsrp
          }
          // A carrier can show a 5G icon when 5G is merely available, so only trust it with an NR signal.
          fiveGIcon && nrSignal -> {
            out.technology = "5G"
            out.nsa = true
            out.signalDbm = out.nrRsrp
          }
          fiveGIcon -> {
            out.technology = "4G"
            out.reliable = false
            out.signalDbm = out.lteRsrp
          }
          else -> {
            out.technology = "4G"
            out.signalDbm = out.lteRsrp
          }
        }
      }
      else -> Unit // 2G, 3G or unknown: not a 4G/5G measurement
    }
  }

  private fun ensureCallback(tm: TelephonyManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val subId = SubscriptionManager.getDefaultDataSubscriptionId()
    if (callback != null && subId == callbackSubId) return

    unregisterCallback()
    val latch = CountDownLatch(1)
    firstInfo = latch
    val cb = DisplayInfoCallback { info ->
      callbackNetworkType = info.networkType
      callbackOverrideType = info.overrideNetworkType
      latch.countDown()
    }
    try {
      tm.registerTelephonyCallback(context.mainExecutor, cb)
      callback = cb
      callbackManager = tm
      callbackSubId = subId
    } catch (e: SecurityException) {
      // Not permitted on this phone: fall back to dataNetworkType alone.
    }
  }

  private fun unregisterCallback() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val cb = callback as? TelephonyCallback
      if (cb != null) {
        try {
          callbackManager?.unregisterTelephonyCallback(cb)
        } catch (e: Exception) {
          // Already gone: nothing to clean up.
        }
      }
    }
    callback = null
    callbackManager = null
    callbackSubId = SubscriptionManager.INVALID_SUBSCRIPTION_ID
    callbackNetworkType = null
    callbackOverrideType = TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NONE
  }

  // Android reports Int.MAX_VALUE for "unavailable"; both ranges below exclude it.
  private fun rsrp(v: Int): Int? = if (v in -140..-30) v else null

  private fun sinr(v: Int): Int? = if (v in -30..50) v else null

  private fun networkLabel(type: Int?): String = when (type) {
    null, TelephonyManager.NETWORK_TYPE_UNKNOWN -> "UNKNOWN"
    TelephonyManager.NETWORK_TYPE_LTE -> "LTE"
    TelephonyManager.NETWORK_TYPE_NR -> "NR"
    TelephonyManager.NETWORK_TYPE_GPRS,
    TelephonyManager.NETWORK_TYPE_EDGE,
    TelephonyManager.NETWORK_TYPE_CDMA,
    TelephonyManager.NETWORK_TYPE_1xRTT,
    TelephonyManager.NETWORK_TYPE_IDEN,
    TelephonyManager.NETWORK_TYPE_GSM -> "2G"
    TelephonyManager.NETWORK_TYPE_UMTS,
    TelephonyManager.NETWORK_TYPE_EVDO_0,
    TelephonyManager.NETWORK_TYPE_EVDO_A,
    TelephonyManager.NETWORK_TYPE_EVDO_B,
    TelephonyManager.NETWORK_TYPE_HSDPA,
    TelephonyManager.NETWORK_TYPE_HSUPA,
    TelephonyManager.NETWORK_TYPE_HSPA,
    TelephonyManager.NETWORK_TYPE_EHRPD,
    TelephonyManager.NETWORK_TYPE_HSPAP,
    TelephonyManager.NETWORK_TYPE_TD_SCDMA -> "3G"
    else -> "OTHER"
  }
}

private class DisplayInfoCallback(private val onInfo: (TelephonyDisplayInfo) -> Unit) :
  TelephonyCallback(), TelephonyCallback.DisplayInfoListener {
  override fun onDisplayInfoChanged(telephonyDisplayInfo: TelephonyDisplayInfo) {
    onInfo(telephonyDisplayInfo)
  }
}
