import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPathBlocked } from "@/lib/auth/module-access";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");
  // /careers is the public job board and apply form (no sign-in).
  const isPublicAsset = request.nextUrl.pathname.startsWith("/_next") || request.nextUrl.pathname.startsWith("/careers");

  if (!user && !isAuthRoute && !isPublicAsset) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Custom roles can have whole modules switched off. Hiding the menu item is
  // not enough (anyone can type the address), so block the page request
  // itself. Only users on a custom role pay for this lookup; built-in roles
  // are unaffected. Fails open on a lookup error: the data underneath is
  // still protected by row-level security.
  if (user && request.nextUrl.pathname.startsWith("/dashboard")) {
    try {
      const { data: appUser } = await supabase.from("app_users").select("custom_role_id").eq("id", user.id).maybeSingle();
      if (appUser?.custom_role_id) {
        const { data: hidden } = await supabase
          .from("rbac_role_modules")
          .select("module_key")
          .eq("role_id", appUser.custom_role_id)
          .eq("can_view", false);
        if (isPathBlocked(request.nextUrl.pathname, (hidden ?? []).map((h) => h.module_key))) {
          const url = request.nextUrl.clone();
          url.pathname = "/dashboard";
          url.search = "";
          const redirect = NextResponse.redirect(url);
          // Short-lived flag so the layout can say why they were sent home.
          redirect.cookies.set("hrms_no_access", "1", { maxAge: 8, path: "/dashboard" });
          return redirect;
        }
      }
    } catch {
      /* fall through */
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
