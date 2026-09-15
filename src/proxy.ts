import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * BOOKLENS_PASSWORD が設定されている時だけ、簡易パスワード（Basic認証）で全ページを保護する。
 * 未設定なら誰でもアクセス可能（＝オープン）。公開リンクを身内だけに絞りたい時に使う。
 */
export function proxy(request: NextRequest) {
  const pw = process.env.BOOKLENS_PASSWORD;
  if (!pw) return NextResponse.next();

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6)); // "user:pass"
      const pass = decoded.slice(decoded.indexOf(":") + 1);
      if (pass === pw) return NextResponse.next();
    } catch {
      /* 不正なヘッダ → 下で401 */
    }
  }
  return new NextResponse("パスワードが必要です", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="BookLens", charset="UTF-8"' },
  });
}

export const config = {
  // 静的アセットとfaviconは除外
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
