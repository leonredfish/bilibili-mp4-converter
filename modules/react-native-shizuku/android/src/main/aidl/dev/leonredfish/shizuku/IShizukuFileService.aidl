// 在 shell(uid 2000) 身份下执行文件操作与命令。
//
// 约定：
// - AIDL 要求「要么每个方法都写事务码，要么都不写」。destroy() 必须为 Shizuku 保留的
//   16777114，所以其余方法也全部显式编号。
// - ⚠️ 这些编号是跨进程 ABI，一旦随版本发布就不能改动/复用。新增方法请追加新编号，
//   并递增 ShizukuModule.USER_SERVICE_VERSION，让 Shizuku 重启旧服务。
// - 为了不依赖 AIDL 生成代码是否声明 throws RemoteException，本接口一律用「哨兵值」
//   表达失败，不抛异常：失败 => null / -1 / false。
package dev.leonredfish.shizuku;

import dev.leonredfish.shizuku.ShellResult;
import dev.leonredfish.shizuku.DirEntry;

interface IShizukuFileService {

    /** 由 Shizuku 服务端调用（保留事务码），用于清理并退出进程 */
    void destroy() = 16777114;

    // ---- 命令 ----

    /**
     * 不经 shell 直接执行程序，规避引号/转义问题。
     * 永不返回 null；无法启动时 code = -1，超时被杀时 code = -2。
     */
    ShellResult exec(String program, in String[] args, String cwd, long timeoutMs) = 1;

    // ---- 文件 ----

    boolean exists(String path) = 2;

    /** 不存在时返回 null */
    DirEntry stat(String path) = 3;

    /** 不是目录或不可读时返回 null */
    DirEntry[] listDir(String path) = 4;

    /** 读取文本文件（UTF-8）；失败或超过 8MB 时返回 null */
    String readTextFile(String path) = 5;

    /** 复制单个文件，自动创建父目录。返回复制的字节数；失败返回 -1 */
    long copyFile(String src, String dst) = 6;

    /** 删除文件或目录。返回是否成功 */
    boolean remove(String path, boolean recursive) = 7;
}
