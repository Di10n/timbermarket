import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminPanel from "@/components/admin-panel";
import type { Market } from "@/lib/types";

export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/markets");

  const [{ data: markets }, { data: featured }] = await Promise.all([
    supabase
      .from("markets")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase
      .from("markets")
      .select("id")
      .eq("is_featured", true)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  const featuredMarketId =
    (featured as { id: string } | null)?.id ?? null;

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Admin</h1>
      <AdminPanel
        activeMarkets={(markets ?? []) as Market[]}
        featuredMarketId={featuredMarketId}
      />
    </div>
  );
}
