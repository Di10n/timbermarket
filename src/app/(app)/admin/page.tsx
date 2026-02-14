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

  if (!profile?.is_admin) redirect("/");

  const { data: markets } = await supabase
    .from("markets")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Admin</h1>
      <AdminPanel activeMarkets={(markets ?? []) as Market[]} />
    </div>
  );
}
