package dev.leonredfish.shizuku;

import android.os.Parcel;
import android.os.Parcelable;

/** 命令执行结果（跨进程传输） */
public class ShellResult implements Parcelable {

  public int code;
  public String stdout;
  public String stderr;

  public ShellResult() {}

  public ShellResult(int code, String stdout, String stderr) {
    this.code = code;
    this.stdout = stdout == null ? "" : stdout;
    this.stderr = stderr == null ? "" : stderr;
  }

  protected ShellResult(Parcel in) {
    code = in.readInt();
    stdout = in.readString();
    stderr = in.readString();
  }

  @Override
  public void writeToParcel(Parcel dest, int flags) {
    dest.writeInt(code);
    dest.writeString(stdout == null ? "" : stdout);
    dest.writeString(stderr == null ? "" : stderr);
  }

  @Override
  public int describeContents() {
    return 0;
  }

  public static final Creator<ShellResult> CREATOR =
      new Creator<ShellResult>() {
        @Override
        public ShellResult createFromParcel(Parcel in) {
          return new ShellResult(in);
        }

        @Override
        public ShellResult[] newArray(int size) {
          return new ShellResult[size];
        }
      };
}
