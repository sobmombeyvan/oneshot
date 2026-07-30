export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black text-off-white touch-manipulation">
      {children}
    </div>
  );
}
