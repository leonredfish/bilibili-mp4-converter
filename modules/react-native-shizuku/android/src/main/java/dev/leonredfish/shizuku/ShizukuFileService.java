package dev.leonredfish.shizuku;

import android.system.Os;
import android.util.Log;

import androidx.annotation.Keep;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Shizuku UserService：由 Shizuku server 以 shell(uid 2000) 或 root(uid 0) 身份拉起，
 * 因此这里的文件操作不受 App 自身的 scoped storage 限制。
 *
 * 实现要点（来自官方 demo）：
 * - 必须继承 AIDL 生成的 Stub
 * - 必须有公开的无参构造函数
 * - 类上标 @Keep，避免 R8 改名导致 Shizuku 反射找不到
 * - destroy() 里必须 System.exit()，因为 unbindUserService 不会杀进程
 */
@Keep
public class ShizukuFileService extends IShizukuFileService.Stub {

  private static final String TAG = "ShizukuFileService";
  private static final int COPY_BUFFER_SIZE = 64 * 1024;
  private static final long MAX_TEXT_BYTES = 8L * 1024 * 1024;

  /** Shizuku 要求：必须提供无参构造函数 */
  public ShizukuFileService() {
    Log.i(TAG, "created uid=" + Os.getuid() + " pid=" + Os.getpid());
  }

  /* ------------------------------------------------------------------ *
   * 生命周期
   * ------------------------------------------------------------------ */

  @Override
  public void destroy() {
    Log.i(TAG, "destroy");
    System.exit(0);
  }

  /* ------------------------------------------------------------------ *
   * 命令
   * ------------------------------------------------------------------ */

  @Override
  public ShellResult exec(String program, String[] args, String cwd, long timeoutMs) {
    Process process = null;
    try {
      List<String> command = new ArrayList<>();
      command.add(program);
      if (args != null) {
        for (String arg : args) {
          command.add(arg);
        }
      }

      ProcessBuilder builder = new ProcessBuilder(command);
      if (cwd != null && !cwd.isEmpty()) {
        builder.directory(new File(cwd));
      }
      process = builder.start();

      // stderr 必须并发抽干，否则管道写满会导致进程阻塞
      final Process proc = process;
      final ByteArrayOutputStream errBuffer = new ByteArrayOutputStream();
      Thread errThread =
          new Thread(
              new Runnable() {
                @Override
                public void run() {
                  try {
                    drain(proc.getErrorStream(), errBuffer);
                  } catch (Throwable ignored) {
                    // 忽略
                  }
                }
              });
      errThread.setDaemon(true);
      errThread.start();

      ByteArrayOutputStream outBuffer = new ByteArrayOutputStream();
      drain(process.getInputStream(), outBuffer);
      errThread.join(2000);

      boolean finished;
      if (timeoutMs > 0) {
        finished = process.waitFor(timeoutMs, TimeUnit.MILLISECONDS);
      } else {
        process.waitFor();
        finished = true;
      }

      if (!finished) {
        process.destroyForcibly();
      }

      return new ShellResult(
          finished ? process.exitValue() : -2,
          outBuffer.toString("UTF-8"),
          errBuffer.toString("UTF-8"));
    } catch (Throwable t) {
      return new ShellResult(-1, "", String.valueOf(t.getMessage()));
    } finally {
      if (process != null) {
        try {
          process.destroy();
        } catch (Throwable ignored) {
          // 忽略
        }
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * 文件
   * ------------------------------------------------------------------ */

  @Override
  public boolean exists(String path) {
    try {
      return new File(path).exists();
    } catch (Throwable t) {
      return false;
    }
  }

  @Override
  public DirEntry stat(String path) {
    try {
      File file = new File(path);
      if (!file.exists()) {
        return null;
      }
      return toEntry(file);
    } catch (Throwable t) {
      return null;
    }
  }

  @Override
  public DirEntry[] listDir(String path) {
    try {
      File dir = new File(path);
      if (!dir.isDirectory()) {
        return null;
      }
      File[] children = dir.listFiles();
      if (children == null) {
        return null;
      }
      DirEntry[] entries = new DirEntry[children.length];
      for (int i = 0; i < children.length; i++) {
        entries[i] = toEntry(children[i]);
      }
      return entries;
    } catch (Throwable t) {
      return null;
    }
  }

  @Override
  public String readTextFile(String path) {
    try {
      File file = new File(path);
      if (!file.isFile() || file.length() > MAX_TEXT_BYTES) {
        return null;
      }
      FileInputStream in = new FileInputStream(file);
      try {
        return new String(readAll(in), StandardCharsets.UTF_8);
      } finally {
        closeQuietly(in);
      }
    } catch (Throwable t) {
      return null;
    }
  }

  @Override
  public long copyFile(String src, String dst) {
    File source = new File(src);
    File target = new File(dst);

    File parent = target.getParentFile();
    if (parent != null && !parent.exists() && !parent.mkdirs()) {
      return -1;
    }

    FileInputStream in = null;
    FileOutputStream out = null;
    try {
      in = new FileInputStream(source);
      out = new FileOutputStream(target);

      byte[] buffer = new byte[COPY_BUFFER_SIZE];
      long total = 0;
      int read;
      while ((read = in.read(buffer)) > 0) {
        out.write(buffer, 0, read);
        total += read;
      }
      out.flush();
      return total;
    } catch (Throwable t) {
      Log.w(TAG, "copyFile failed: " + src + " -> " + dst + " : " + t.getMessage());
      return -1;
    } finally {
      closeQuietly(in);
      closeQuietly(out);
    }
  }

  @Override
  public boolean remove(String path, boolean recursive) {
    try {
      return deleteRecursively(new File(path), recursive);
    } catch (Throwable t) {
      return false;
    }
  }

  /* ------------------------------------------------------------------ *
   * 内部工具
   * ------------------------------------------------------------------ */

  private static DirEntry toEntry(File file) {
    String type;
    if (file.isDirectory()) {
      type = "directory";
    } else if (file.isFile()) {
      type = "file";
    } else {
      type = "other";
    }
    return new DirEntry(
        type, file.getName(), file.getAbsolutePath(), file.length(), file.lastModified());
  }

  /** 递归删除；recursive=false 时只删空目录或文件 */
  private static boolean deleteRecursively(File file, boolean recursive) {
    if (!file.exists()) {
      return false;
    }
    if (file.isDirectory()) {
      if (!recursive) {
        return file.delete();
      }
      File[] children = file.listFiles();
      if (children != null) {
        for (File child : children) {
          deleteRecursively(child, true);
        }
      }
    }
    return file.delete();
  }

  private static void drain(InputStream in, ByteArrayOutputStream out) throws IOException {
    byte[] buffer = new byte[8192];
    int read;
    while ((read = in.read(buffer)) > 0) {
      out.write(buffer, 0, read);
    }
  }

  private static byte[] readAll(InputStream in) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    drain(in, out);
    return out.toByteArray();
  }

  private static void closeQuietly(java.io.Closeable closeable) {
    if (closeable != null) {
      try {
        closeable.close();
      } catch (Throwable ignored) {
        // 忽略
      }
    }
  }
}
