/** The pinned CPU renderer only exists on Linux. On Windows and macOS the GPU
 *  suites are skipped: this is not a concession, it is the only way golden
 *  images stay bit-for-bit stable. */
export const SOFTWARE = process.platform === "linux";
