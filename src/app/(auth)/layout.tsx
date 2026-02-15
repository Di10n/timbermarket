import Footer from "@/components/footer";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
