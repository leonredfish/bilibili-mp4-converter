package dev.leonredfish.shizuku;

import android.content.ComponentName;
import android.content.ServiceConnection;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import rikka.shizuku.Shizuku;

/**
 * react-native-shizuku —— Android 原生模块。
 *
 * M0：状态查询 + 授权 + binder 事件。
 * M1：绑定 Shizuku UserService（以 shell/root 身份运行），提供文件与命令操作。
 *
 * 采用传统的 ReactContextBaseJavaModule，在 New Architecture 下通过 RN 的 interop 层工作，
 * 因此同一份实现可同时兼容新旧架构。
 */
public class ShizukuModule extends ReactContextBaseJavaModule {

  public static final String NAME = "Shizuku";

  /** Shizuku App 的包名 */
  private static final String SHIZUKU_PACKAGE = "moe.shizuku.privileged.api";

  /** UserService 需要 Shizuku API 10+ */
  private static final int MIN_USER_SERVICE_API = 10;

  /** 改动 UserService 的 AIDL/实现后要递增，Shizuku 会据此重启服务 */
  private static final int USER_SERVICE_VERSION = 1;

  /** Shizuku 要求 requestCode 不与系统冲突，这里用一个高位起点 */
  private static final int REQUEST_CODE_BASE = 42000;

  private static final long BIND_TIMEOUT_MS = 8000L;

  /* ---------------- M0：状态 / 授权 ---------------- */

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
          fileService = null;
          emitStatus();
        }
      };

  /* ---------------- M1：UserService ---------------- */

  private final Object bindLock = new Object();
  private final List<Promise> bindWaiters = new ArrayList<>();
  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  private volatile Shizuku.UserServiceArgs userServiceArgs;
  private volatile IShizukuFileService fileService;
  private boolean binding = false;

  private final ServiceConnection serviceConnection =
      new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder binder) {
          fileService = IShizukuFileService.Stub.asInterface(binder);

          List<Promise> waiters;
          synchronized (bindLock) {
            binding = false;
            waiters = new ArrayList<>(bindWaiters);
            bindWaiters.clear();
          }
          for (Promise promise : waiters) {
            promise.resolve(true);
          }
          emitStatus();
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
          fileService = null;
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
   * M0：状态
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
      map.putBoolean("userServiceReady", fileService != null);

      String versionName = "";
      try {
        PackageInfo info =
            getReactApplicationContext()
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
   * M0：授权
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
   * M1：UserService 绑定
   * ------------------------------------------------------------------ */

  /** 绑定 UserService（幂等）。已就绪时直接 resolve(true)。 */
  @ReactMethod
  public void ensureService(final Promise promise) {
    if (fileService != null) {
      promise.resolve(true);
      return;
    }

    final String status = computeStatus();
    if (!"ready".equals(status)) {
      promise.reject(statusToErrorCode(status), "Shizuku status is '" + status + "'.");
      return;
    }

    try {
      if (Shizuku.getVersion() < MIN_USER_SERVICE_API) {
        promise.reject(
            "UNSUPPORTED",
            "UserService requires Shizuku API " + MIN_USER_SERVICE_API + "+ (found "
                + Shizuku.getVersion() + ").");
        return;
      }
    } catch (Throwable t) {
      promise.reject("SERVICE_NOT_RUNNING", String.valueOf(t.getMessage()));
      return;
    }

    synchronized (bindLock) {
      bindWaiters.add(promise);
      if (binding) {
        return;
      }
      binding = true;
    }

    try {
      Shizuku.bindUserService(getUserServiceArgs(), serviceConnection);
    } catch (Throwable t) {
      synchronized (bindLock) {
        binding = false;
      }
      failWaiters("USER_SERVICE_NOT_BOUND", "bindUserService failed: " + t.getMessage());
      return;
    }

    mainHandler.postDelayed(
        new Runnable() {
          @Override
          public void run() {
            if (fileService != null) {
              return;
            }
            synchronized (bindLock) {
              binding = false;
            }
            failWaiters(
                "USER_SERVICE_NOT_BOUND",
                "Timed out after " + BIND_TIMEOUT_MS + "ms waiting for Shizuku UserService.");
          }
        },
        BIND_TIMEOUT_MS);
  }

  /* ------------------------------------------------------------------ *
   * M1：命令
   * ------------------------------------------------------------------ */

  @ReactMethod
  public void exec(
      String program, ReadableArray args, String cwd, double timeoutMs, Promise promise) {
    IShizukuFileService service = fileService;
    if (service == null) {
      promise.reject("USER_SERVICE_NOT_BOUND", "Call ensureService() first.");
      return;
    }

    String[] argv = null;
    if (args != null) {
      argv = new String[args.size()];
      for (int i = 0; i < args.size(); i++) {
        argv[i] = args.getString(i);
      }
    }

    try {
      ShellResult result = service.exec(program, argv, cwd, (long) timeoutMs);
      if (result == null) {
        promise.reject("COMMAND_FAILED", "exec returned no result.");
        return;
      }
      WritableMap map = Arguments.createMap();
      map.putInt("code", result.code);
      map.putString("stdout", result.stdout);
      map.putString("stderr", result.stderr);
      promise.resolve(map);
    } catch (Throwable t) {
      promise.reject("COMMAND_FAILED", String.valueOf(t.getMessage()), t);
    }
  }

  /* ------------------------------------------------------------------ *
   * M1：文件
   * ------------------------------------------------------------------ */

  @ReactMethod
  public void exists(String path, Promise promise) {
    IShizukuFileService service = fileService;
    if (service == null) {
      promise.reject("USER_SERVICE_NOT_BOUND", "Call ensureService() first.");
      return;
    }
    try {
      promise.resolve(service.exists(path));
    } catch (Throwable t) {
      promise.reject("IO_ERROR", String.valueOf(t.getMessage()), t);
    }
  }

  @ReactMethod
  public void stat(String path, Promise promise) {
    IShizukuFileService service = fileService;
    if (service == null) {
      promise.reject("USER_SERVICE_NOT_BOUND", "Call ensureService() first.");
      return;
    }
    try {
      DirEntry entry = service.stat(path);
      promise.resolve(entry == null ? null : toMap(entry));
    } catch (Throwable t) {
      promise.reject("IO_ERROR", String.valueOf(t.getMessage()), t);
    }
  }

  @ReactMethod
  public void listDir(String path, Promise promise) {
    IShizukuFileService service = fileService;
    if (service == null) {
      promise.reject("USER_SERVICE_NOT_BOUND", "Call ensureService() first.");
      return;
    }
    try {
      DirEntry[] entries = service.listDir(path);
      if (entries == null) {
        promise.reject("IO_ERROR", "Not a directory or unreadable: " + path);
        return;
      }
      WritableArray array = Arguments.createArray();
      for (DirEntry entry : entries) {
        array.pushMap(toMap(entry));
      }
      promise.resolve(array);
    } catch (Throwable t) {
      promise.reject("IO_ERROR", String.valueOf(t.getMessage()), t);
    }
  }

  @ReactMethod
  public void readTextFile(String path, Promise promise) {
    IShizukuFileService service = fileService;
    if (service == null) {
      promise.reject("USER_SERVICE_NOT_BOUND", "Call ensureService() first.");
      return;
    }
    try {
      String content = service.readTextFile(path);
      if (content == null) {
        promise.reject("IO_ERROR", "Cannot read file (missing or too large): " + path);
        return;
      }
      promise.resolve(content);
    } catch (Throwable t) {
      promise.reject("IO_ERROR", String.valueOf(t.getMessage()), t);
    }
  }

  @ReactMethod
  public void copyFile(String src, String dst, Promise promise) {
    IShizukuFileService service = fileService;
    if (service == null) {
      promise.reject("USER_SERVICE_NOT_BOUND", "Call ensureService() first.");
      return;
    }
    try {
      long bytes = service.copyFile(src, dst);
      if (bytes < 0) {
        promise.reject("IO_ERROR", "Copy failed: " + src + " -> " + dst);
        return;
      }
      promise.resolve((double) bytes);
    } catch (Throwable t) {
      promise.reject("IO_ERROR", String.valueOf(t.getMessage()), t);
    }
  }

  @ReactMethod
  public void remove(String path, boolean recursive, Promise promise) {
    IShizukuFileService service = fileService;
    if (service == null) {
      promise.reject("USER_SERVICE_NOT_BOUND", "Call ensureService() first.");
      return;
    }
    try {
      promise.resolve(service.remove(path, recursive));
    } catch (Throwable t) {
      promise.reject("IO_ERROR", String.valueOf(t.getMessage()), t);
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

  private Shizuku.UserServiceArgs getUserServiceArgs() {
    if (userServiceArgs == null) {
      ReactApplicationContext context = getReactApplicationContext();
      // 注意：不能用 BuildConfig.APPLICATION_ID —— 在库里那是「库自身的 namespace」。
      ComponentName component =
          new ComponentName(context.getPackageName(), ShizukuFileService.class.getName());
      boolean debuggable =
          (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;

      userServiceArgs =
          new Shizuku.UserServiceArgs(component)
              .daemon(false)
              .processNameSuffix("shizuku")
              .debuggable(debuggable)
              .version(USER_SERVICE_VERSION);
    }
    return userServiceArgs;
  }

  private void failWaiters(String code, String message) {
    List<Promise> waiters;
    synchronized (bindLock) {
      waiters = new ArrayList<>(bindWaiters);
      bindWaiters.clear();
    }
    for (Promise promise : waiters) {
      promise.reject(code, message);
    }
  }

  private static WritableMap toMap(DirEntry entry) {
    WritableMap map = Arguments.createMap();
    map.putString("type", entry.type);
    map.putString("name", entry.name);
    map.putString("path", entry.path);
    map.putDouble("size", entry.size);
    map.putDouble("mtimeMs", entry.mtimeMs);
    return map;
  }

  private static String statusToErrorCode(String status) {
    if ("not-running".equals(status)) {
      return "SERVICE_NOT_RUNNING";
    }
    if ("no-permission".equals(status)) {
      return "PERMISSION_DENIED";
    }
    return "UNSUPPORTED";
  }

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

    context.runOnJSQueueThread(
        new Runnable() {
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

    // 故意不 unbind / destroy：
    // Shizuku 按 (tag, version) 复用 UserService，JS reload 后重新 bind 会拿回同一个实例。
    fileService = null;

    super.invalidate();
  }
}
