import { NextResponse, type NextRequest } from "next/server";

// İyimser kontrol: çerez yoksa girişe yönlendir. Asıl doğrulama sunucu tarafında yapılır.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("yoklama_session")) {
    return NextResponse.redirect(new URL("/giris", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!giris|_next|favicon.ico|api/health).*)"],
};
