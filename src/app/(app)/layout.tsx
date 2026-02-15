import Navbar from "@/components/navbar";
import Footer from "@/components/footer";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8 flex-1 w-full">{children}</main>
      <Footer />
    </div>
  );
}
