import './globals.css';

export const metadata = {
  title: 'SMM Panel',
  description: 'Order social media growth services',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">Panel</div>
            <a className="nav-link active" href="/services">Services</a>
            <a className="nav-link" href="/orders">Orders</a>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
