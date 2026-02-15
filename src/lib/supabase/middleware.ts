import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  // CSRF protection: reject mutating API requests from foreign origins
  const method = request.method;
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    method !== "GET" &&
    method !== "HEAD" &&
    method !== "OPTIONS"
  ) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin) {
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (originHost !== host) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      // No Origin header on a mutating request — block it.
      // Legitimate same-origin fetch/XHR always sends Origin.
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const publicRoutes = [
    "/",
    "/login",
    "/signup",
    "/api/auth/signup",
    "/",
    "/leaderboard",
  ];
  const isPublicRoute = publicRoutes.some((r) => pathname === r || pathname.startsWith(r + "/"));

  // Only portfolio and admin require authentication
  const protectedRoutes = ["/portfolio", "/admin"];
  const isProtectedRoute = protectedRoutes.some((r) => pathname.startsWith(r));

  // Redirect unauthenticated users to login only for protected routes
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages (login/signup)
  const authPages = ["/login", "/signup", "/forgot-password"];
  const isAuthPage = authPages.some((r) => pathname.startsWith(r));
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Redirect approved users away from /verify (nothing to do there)
  if (user && pathname === "/verify") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_approved")
      .eq("id", user.id)
      .single();

    if (profile?.is_approved) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  // Check approval for authenticated users accessing protected routes
  if (user && isProtectedRoute) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_approved")
      .eq("id", user.id)
      .single();

    if (!profile?.is_approved) {
      const url = request.nextUrl.clone();
      url.pathname = "/verify";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
