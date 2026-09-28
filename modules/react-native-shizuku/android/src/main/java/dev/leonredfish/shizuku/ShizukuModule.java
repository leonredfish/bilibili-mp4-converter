package dev.leonredfish.shizuku;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import rikka.shizuku.Shizuku;

/**
 * react-native-shizuku —— Android 原生模块（M0：状态查询 + 授权）。
 *
 * 采用传统的 ReactContextBaseJavaModule，在 New Architecture 下通过 RN 的
 * interop 层工作，因此同一个实现可同时兼容新旧架构。
 */
public class ShizukuModule extends ReactContextBaseJavaModule {

  public static final String NAME = "Shizuku";

  /** Shizuku App 的包名 */
  private static final String SHIZUKU_PACKAGE = "moe.shizuku.privileged.api";

  /** Shizuku 要求 requestCode 不与系统冲突，这里用一个高位起点 */
  private static final int REQUEST_CODE_BASE = 42000;

  private final AtomicInteger nextRequestCode = new AtomicInteger(REQUEST_CODE_BASE);
  private final Map<Integer, Promise> pendingPermissionRequests = new ConcurrentHashMap<>();

  private final Shizuku.OnRequestPermissionResultListener permissionResultListener =
      new Shizuku.OnRequestPermissionResultListener() {
        @Override
        public void onRequestPermissionResult(int requestCode, int grantResult) {
          Promise promise = pendingPermissionRequests.remove(requestCode);
          if (promise != null) {
            promise.resolve(grantResult == PackageManager.PERMISSION_GRANTED);
          }
        }
      };

  private final Shizuku.OnBinderReceivedListener binderReceivedListener =
      new Shizuku.OnBinderReceivedListener() {
        @Override
        public void onBinderReceived() {
          emitStatus();
        }
      };

  private final Shizuku.OnBinderDeadListener binderDeadListener =
      new Shizuku.OnBinderDeadListener() {
        @Override
        public void onBinderDead() {
          emitStatus();
        }
      };

  public ShizukuModule(ReactApplicationContext reactContext) {
    super(reactContext);
    // 这三个监听器注册本身不需要 binder，可以安全地在构造期完成
    try {
      Shizuku.addRequestPermissionResultListener(permissionResultListener);
      Shizuku.addBinderReceivedListener(binderReceivedListener);
      Shizuku.addBinderDeadListener(binderDeadListener);
    } catch (Throwable ignored) {
      // 极端情况下（Shizuku 库初始化异常）不应导致 App 崩溃
    }
  }

  @NonNull
  @Override
  public String getName() {
    return NAME;
  }

  /* ------------------------------------------------------------------ *
   * 状态
   * ------------------------------------------------------------------ */

  @ReactMethod
  public void getStatus(Promise promise) {
    promise.resolve(computeStatus());
  }

  @ReactMethod
  public void getShizukuInfo(Promise promise) {
    try {
      WritableMap map = Arguments.createMap();
      map.putInt("apiVersion", Shizuku.getVersion());

      String versionName = "";
      try {
        PackageInfo info = getReactApplicationContext()
            .getPackageManager()
            .getPackageInfo(SHIZUKU_PACKAGE, 0);
        if (info.versionName != null) {
          versionName = info.versionName;
        }
      } catch (PackageManager.NameNotFoundException ignored) {
        // 未安装时留空
      }
      map.putString("versionName", versionName);

      promise.resolve(map);
    } catch (Throwable t) {
      promise.resolve(null);
    }
  }

  /* ------------------------------------------------------------------ *
   * 授权
   * ------------------------------------------------------------------ */

  @ReactMethod
  public void requestPermission(Promise promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
      promise.reject("UNSUPPORTED", "Shizuku requires Android 7.0 (API 24) or higher.");
      return;
    }
    if (!isShizukuInstalled()) {
      promise.reject("SERVICE_NOT_RUNNING", "Shizuku is not installed.");
      return;
    }
    if (!Shizuku.pingBinder()) {
      promise.reject("SERVICE_NOT_RUNNING", "Shizuku service is not running.");
      return;
    }

    try {
      if (Shizuku.isPreV11()) {
        promise.reject("UNSUPPORTED", "Shizuku pre-v11 is not supported.");
        return;
      }
      if (Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED) {
        promise.resolve(true);
        return;
      }
      if (Shizuku.shouldShowRequestPermissionRationale()) {
        // 用户此前选择了「拒绝且不再询问」
        promise.resolve(false);
        return;
      }

      int requestCode = nextRequestCode.incrementAndGet();
      pendingPermissionRequests.put(requestCode, promise);
      Shizuku.requestPermission(requestCode);
    } catch (Throwable t) {
      promise.reject("PERMISSION_DENIED", t.getMessage(), t);
    }
  }

  /* ------------------------------------------------------------------ *
   * NativeEventEmitter 需要的两个空实现
   * ------------------------------------------------------------------ */

  @ReactMethod
  public void addListener(String eventName) {
    // 由 NativeEventEmitter 调用；本模块不需要额外处理
  }

  @ReactMethod
  public void removeListeners(double count) {
    // 同上
  }

  /* ------------------------------------------------------------------ *
   * 内部
   * ------------------------------------------------------------------ */

  /**
   * 状态判定顺序不可颠倒：
   * 平台 → 是否安装 → binder 是否存活 → 版本 → 是否授权
   */
  private String computeStatus() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
      return "unsupported";
    }
    if (!isShizukuInstalled()) {
      return "not-installed";
    }
    if (!Shizuku.pingBinder()) {
      return "not-running";
    }
    try {
      if (Shizuku.isPreV11()) {
        return "unsupported";
      }
      return Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED
          ? "ready"
          : "no-permission";
    } catch (Throwable t) {
      // binder 在判定过程中死亡
      return "not-running";
    }
  }

  private boolean isShizukuInstalled() {
    try {
      getReactApplicationContext()
          .getPackageManager()
          .getPackageInfo(SHIZUKU_PACKAGE, 0);
      return true;
    } catch (PackageManager.NameNotFoundException e) {
      return false;
    } catch (Throwable t) {
      return false;
    }
  }

  /** 把当前状态推给 JS。监听器可能在任意线程触发，统一切到 JS 队列再 emit。 */
  private void emitStatus() {
    final String status = computeStatus();
    final ReactApplicationContext context = getReactApplicationContext();

    if (context == null || !context.hasActiveReactInstance()) {
      return;
    }

    context.runOnJSQueueThread(new Runnable() {
      @Override
      public void run() {
        try {
          context
              .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
              .emit("onStatusChanged", status);
        } catch (Throwable ignored) {
          // JS 侧尚未挂载监听时忽略
        }
      }
    });
  }

  @Override
  public void invalidate() {
    try {
      Shizuku.removeRequestPermissionResultListener(permissionResultListener);
      Shizuku.removeBinderReceivedListener(binderReceivedListener);
      Shizuku.removeBinderDeadListener(binderDeadListener);
    } catch (Throwable ignored) {
      // 忽略
    }

    for (Promise promise : pendingPermissionRequests.values()) {
      promise.reject("COMMAND_FAILED", "Shizuku module was invalidated.");
    }
    pendingPermissionRequests.clear();

    super.invalidate();
  }
}
