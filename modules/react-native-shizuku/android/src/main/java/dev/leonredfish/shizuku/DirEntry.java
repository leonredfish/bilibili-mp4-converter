package dev.leonredfish.shizuku;

import android.os.Parcel;
import android.os.Parcelable;

/** 目录项（跨进程传输） */
public class DirEntry implements Parcelable {

  /** 'file' | 'directory' | 'other' */
  public String type;
  public String name;
  public String path;
  public long size;
  public long mtimeMs;

  public DirEntry() {}

  public DirEntry(String type, String name, String path, long size, long mtimeMs) {
    this.type = type;
    this.name = name;
    this.path = path;
    this.size = size;
    this.mtimeMs = mtimeMs;
  }

  protected DirEntry(Parcel in) {
    type = in.readString();
    name = in.readString();
    path = in.readString();
    size = in.readLong();
    mtimeMs = in.readLong();
  }

  @Override
  public void writeToParcel(Parcel dest, int flags) {
    dest.writeString(type);
    dest.writeString(name);
    dest.writeString(path);
    dest.writeLong(size);
    dest.writeLong(mtimeMs);
  }

  @Override
  public int describeContents() {
    return 0;
  }

  public static final Creator<DirEntry> CREATOR =
      new Creator<DirEntry>() {
        @Override
        public DirEntry createFromParcel(Parcel in) {
          return new DirEntry(in);
        }

        @Override
        public DirEntry[] newArray(int size) {
          return new DirEntry[size];
        }
      };
}
