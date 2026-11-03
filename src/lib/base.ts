// public/ 配下のパスに basePath を前置する。Pages では /hatsunichi、手元では空
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const withBase = (path: string) => `${BASE}${path}`;
